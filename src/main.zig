//! dprint plugin for Zig formatting using the Zig standard library formatter.
//!
//! This plugin implements dprint's Wasm Plugin Schema v4 and wraps Zig's
//! built-in `std.zig.Ast` parser and renderer to provide consistent formatting.

const std = @import("std");
const builtin = @import("builtin");

// =============================================================================
// Build Configuration
// =============================================================================

const is_wasm: bool = builtin.cpu.arch == .wasm32;

// =============================================================================
// dprint Schema v4 Types
// =============================================================================

/// Byte length returned to host (for buffer sizes)
const ByteLength = u32;

/// Pointer to Wasm memory buffer (mutable - host writes here)
const WasmPtr = [*]u8;

/// Configuration identifier from dprint host
const ConfigId = u32;

/// Result of a format operation
const FormatResult = enum(u32) {
    /// Source unchanged, no output needed
    no_change = 0,
    /// Source was reformatted, call get_formatted_text()
    changed = 1,
    /// Error occurred, call get_error_text()
    @"error" = 2,
};

fn resolveModeFromPath(file_path: []const u8) std.zig.Ast.Mode {
    if (std.mem.endsWith(u8, file_path, ".zon")) {
        return .zon;
    }
    return .zig;
}

const Position = struct {
    line: usize,
    column: usize,
};

fn computeLineColumn(source: []const u8, offset: usize) Position {
    var line: usize = 1;
    var column: usize = 1;
    var i: usize = 0;
    while (i < source.len and i < offset) : (i += 1) {
        if (source[i] == '\n') {
            line += 1;
            column = 1;
        } else {
            column += 1;
        }
    }
    return .{ .line = line, .column = column };
}

fn buildParseErrorMessage(
    allocator: std.mem.Allocator,
    source: []const u8,
    file_path: []const u8,
    token_starts: []const u32,
    errors: []const std.zig.Ast.Error,
) ![]u8 {
    var list = try std.ArrayList(u8).initCapacity(allocator, errors.len * 32);
    defer list.deinit(allocator);

    const path = if (file_path.len > 0) file_path else "<unknown>";

    var idx: usize = 0;
    var writer = list.writer(allocator);
    for (errors) |parse_error| {
        if (idx != 0) {
            try writer.writeAll("\n");
        }
        const token_index = parse_error.token;
        const offset: usize = if (token_index < token_starts.len) @intCast(token_starts[token_index]) else 0;
        const pos = computeLineColumn(source, offset);
        try writer.print("{s}:{d}:{d}: {s}", .{ path, pos.line, pos.column, @tagName(parse_error.tag) });
        idx += 1;
    }

    return try list.toOwnedSlice(allocator);
}

fn diagnosticsForConfig(bytes: []const u8, allocator: std.mem.Allocator) []const u8 {
    const empty_array = "[]";
    const invalid_json = "[\"Invalid JSON override config\"]";
    const unknown = "[\"Unknown configuration properties are not supported\"]";

    if (bytes.len == 0) return empty_array;

    const parsed = std.json.parseFromSlice(std.json.Value, allocator, bytes, .{}) catch return invalid_json;
    defer parsed.deinit();

    return switch (parsed.value) {
        .object => |obj| if (obj.count() == 0) empty_array else unknown,
        else => unknown,
    };
}

// =============================================================================
// Comptime JSON Serialization
// =============================================================================

/// Serialize any value to JSON at comptime using std.json.
/// This handles escaping, nested structures, and all JSON types correctly.
/// Uses std.fmt.comptimePrint with std.json.fmt for Zig 0.15+ compatibility.
fn comptimeJsonStringify(comptime value: anytype) *const [comptimeJsonLen(value)]u8 {
    comptime {
        @setEvalBranchQuota(10000);
        return std.fmt.comptimePrint("{f}", .{std.json.fmt(value, .{})});
    }
}

/// Calculate the length of JSON output at comptime
fn comptimeJsonLen(comptime value: anytype) usize {
    comptime {
        @setEvalBranchQuota(10000);
        return std.fmt.count("{f}", .{std.json.fmt(value, .{})});
    }
}

// =============================================================================
// Plugin Metadata
// =============================================================================

/// Plugin information reported to dprint host.
/// Field names use camelCase to match dprint's expected JSON schema.
const PluginInfo = struct {
    name: []const u8 = "dprint-plugin-zig",
    version: []const u8 = "0.1.2",
    configKey: []const u8 = "zig",
    fileExtensions: []const []const u8 = &.{ "zig", "zon" },
    fileNames: []const []const u8 = &.{},
    helpUrl: []const u8 = "https://github.com/kjanat/dprint-plugin-zig",
    configSchemaUrl: []const u8 = "https://plugins.dprint.dev/kjanat/zig/latest/schema.json",

    /// Serialize to JSON at comptime
    pub fn toJson(comptime self: PluginInfo) []const u8 {
        return comptimeJsonStringify(self);
    }
};

/// File matching configuration for a specific config ID.
/// Used by get_config_file_matching to tell dprint which files this plugin handles.
const FileMatchingInfo = struct {
    fileExtensions: []const []const u8 = &.{ "zig", "zon" },
    fileNames: []const []const u8 = &.{},

    /// Serialize to JSON at comptime
    pub fn toJson(comptime self: FileMatchingInfo) []const u8 {
        return comptimeJsonStringify(self);
    }
};

/// Plugin metadata instance
const plugin_info: PluginInfo = .{};

/// File matching instance
const file_matching_info: FileMatchingInfo = .{};

/// Plugin info as JSON string (computed at comptime)
const PLUGIN_INFO_JSON: []const u8 = plugin_info.toJson();

/// File matching info as JSON string (computed at comptime)
const FILE_MATCHING_JSON: []const u8 = file_matching_info.toJson();

/// License text embedded from LICENSE file
const LICENSE_TEXT: []const u8 = @embedFile("LICENSE");

// =============================================================================
// Wasm Runtime (only compiled for wasm32 target)
// =============================================================================

const WasmRuntime = if (is_wasm) struct {
    const Self = @This();
    const WASM_PAGE_SIZE: usize = 65536;
    const INITIAL_HEAP_PAGES: usize = 16; // 1MB

    // Heap management
    var heap_base: [*]u8 = undefined;
    var heap_end: [*]u8 = undefined;
    var heap_ptr: [*]u8 = undefined;
    var heap_initialized: bool = false;

    // Shared buffer for host communication
    var shared_buffer: []u8 = &.{};
    var shared_buffer_capacity: usize = 0;
    var shared_buffer_len: usize = 0;

    // Plugin state
    var file_path: []u8 = &.{};
    var override_config: []u8 = &.{};
    var formatted_output: []u8 = &.{};
    var error_message: []u8 = &.{};
    var original_source: []u8 = &.{};

    // Config registry (supports up to 16 concurrent configs)
    const MAX_CONFIGS: usize = 16;
    var config_registered: [MAX_CONFIGS]bool = [_]bool{false} ** MAX_CONFIGS;

    // -------------------------------------------------------------------------
    // Heap Allocator
    // -------------------------------------------------------------------------

    fn initHeap() void {
        const current_pages = @wasmMemorySize(0);
        heap_base = @ptrFromInt(current_pages * WASM_PAGE_SIZE);
        heap_end = heap_base;
        heap_ptr = heap_base;

        // Grow initial heap
        _ = @wasmMemoryGrow(0, INITIAL_HEAP_PAGES);
        heap_end = @ptrFromInt(@intFromPtr(heap_base) + INITIAL_HEAP_PAGES * WASM_PAGE_SIZE);
    }

    fn ensureInitialized() void {
        if (!heap_initialized) {
            initHeap();
            heap_initialized = true;
        }
    }

    fn allocRaw(len: usize) ?[*]u8 {
        const aligned_len = (len + 7) & ~@as(usize, 7); // 8-byte alignment
        const current = heap_ptr;
        const new_ptr: [*]u8 = @ptrFromInt(@intFromPtr(heap_ptr) + aligned_len);

        if (@intFromPtr(new_ptr) > @intFromPtr(heap_end)) {
            const pages_needed = (aligned_len + WASM_PAGE_SIZE - 1) / WASM_PAGE_SIZE;
            const result = @wasmMemoryGrow(0, pages_needed);
            if (result == -1) return null;
            heap_end = @ptrFromInt(@intFromPtr(heap_end) + pages_needed * WASM_PAGE_SIZE);
        }

        heap_ptr = new_ptr;
        return current;
    }

    fn allocSlice(len: usize) ?[]u8 {
        const ptr = allocRaw(len) orelse return null;
        return ptr[0..len];
    }

    // -------------------------------------------------------------------------
    // Shared Buffer Operations
    // -------------------------------------------------------------------------

    fn ensureBufferCapacity(size: usize) bool {
        ensureInitialized();
        const max_size: usize = 8 * 1024 * 1024; // 8MB guard
        if (size > max_size) return false;
        if (shared_buffer_capacity < size) {
            const new_buf = allocSlice(size) orelse return false;
            shared_buffer = new_buf;
            shared_buffer_capacity = size;
        }
        return true;
    }

    fn writeToBuffer(data: []const u8) bool {
        if (!ensureBufferCapacity(data.len)) return false;
        @memcpy(shared_buffer[0..data.len], data);
        shared_buffer_len = data.len;
        return true;
    }

    fn getBufferContent() []const u8 {
        return shared_buffer[0..shared_buffer_len];
    }

    fn getBufferPtr() WasmPtr {
        ensureInitialized();
        if (shared_buffer.len == 0) {
            _ = ensureBufferCapacity(1024);
        }
        return shared_buffer.ptr;
    }

    fn clearBuffer(size: ByteLength) WasmPtr {
        ensureInitialized();
        if (!ensureBufferCapacity(size)) {
            return shared_buffer.ptr;
        }
        @memset(shared_buffer[0..size], 0);
        shared_buffer_len = size;
        return shared_buffer.ptr;
    }

    fn clearPerConfigState() void {
        override_config = &.{};
    }

    // -------------------------------------------------------------------------
    // Config Management
    // -------------------------------------------------------------------------

    fn registerConfig(config_id: ConfigId) void {
        if (config_id < MAX_CONFIGS) {
            config_registered[config_id] = true;
        }
    }

    fn releaseConfig(config_id: ConfigId) void {
        if (config_id < MAX_CONFIGS) {
            config_registered[config_id] = false;
        }
        clearPerConfigState();
    }

    // -------------------------------------------------------------------------
    // State Management
    // -------------------------------------------------------------------------

    fn storeFilePath() void {
        ensureInitialized();
        const content = getBufferContent();
        if (file_path.len != 0) {
            file_path = &.{};
        }
        const buf = allocSlice(content.len) orelse return;
        @memcpy(buf, content);
        file_path = buf;
    }

    fn storeOverrideConfig() void {
        ensureInitialized();
        const content = getBufferContent();
        if (override_config.len != 0) {
            override_config = &.{};
        }
        const buf = allocSlice(content.len) orelse return;
        @memcpy(buf, content);
        override_config = buf;
    }

    fn setErrorMessage(msg: []const u8) void {
        ensureInitialized();
        error_message = &.{};
        const buf = allocSlice(msg.len) orelse return;
        @memcpy(buf, msg);
        error_message = buf;
    }

    fn setErrorMessageOwned(buf: []u8) void {
        ensureInitialized();
        error_message = buf;
    }

    // -------------------------------------------------------------------------
    // Zig Formatter
    // -------------------------------------------------------------------------

    fn formatSource(source: []const u8) FormatResult {
        ensureInitialized();
        resetPerRequestState();

        if (source.len == 0) {
            return .no_change;
        }

        // Store original for comparison
        const src_copy = allocSlice(source.len) orelse {
            setErrorMessage("Out of memory");
            return .@"error";
        };
        @memcpy(src_copy, source);
        original_source = src_copy;

        // Use std.heap.wasm_allocator for AST operations (Zig 0.15+ API)
        const allocator = std.heap.wasm_allocator;

        // Create sentinel-terminated copy for parser
        const source_z = allocator.allocSentinel(u8, source.len, 0) catch {
            setErrorMessage("Out of memory");
            return .@"error";
        };
        defer allocator.free(source_z);
        @memcpy(source_z, source);

        const mode = resolveModeFromPath(file_path);

        // Parse source
        var ast = std.zig.Ast.parse(allocator, source_z, mode) catch {
            setErrorMessage("Failed to parse source");
            return .@"error";
        };
        defer ast.deinit(allocator);

        // Check for parse errors
        if (ast.errors.len > 0) {
            const msg = buildParseErrorMessage(allocator, source, file_path, ast.tokens.items(.start), ast.errors) catch {
                setErrorMessage("Parse error in source");
                return .@"error";
            };
            setErrorMessageOwned(msg);
            return .@"error";
        }

        // Render formatted output (Zig 0.15+ API)
        const rendered = ast.renderAlloc(allocator) catch {
            setErrorMessage("Failed to render formatted code");
            return .@"error";
        };
        defer allocator.free(rendered);

        // Store formatted output
        const output_buf = allocSlice(rendered.len) orelse {
            setErrorMessage("Out of memory");
            return .@"error";
        };
        @memcpy(output_buf, rendered);
        formatted_output = output_buf;

        // Check if content changed
        if (rendered.len == original_source.len and
            std.mem.eql(u8, original_source, rendered))
        {
            return .no_change;
        }

        return .changed;
    }

    fn getFormattedText() ByteLength {
        if (formatted_output.len == 0) return 0;
        if (!writeToBuffer(formatted_output)) return 0;
        return @intCast(formatted_output.len);
    }

    fn getErrorText() ByteLength {
        if (error_message.len == 0) return 0;
        if (!writeToBuffer(error_message)) return 0;
        return @intCast(error_message.len);
    }

    fn resetPerRequestState() void {
        formatted_output = &.{};
        error_message = &.{};
        original_source = &.{};
    }
} else struct {
    // Stub for non-wasm builds (allows tests to compile)
};

// =============================================================================
// dprint Schema v4 Exports
// =============================================================================

/// Schema version marker - dprint checks for existence of this export
export fn dprint_plugin_version_4() u32 {
    return 4;
}

/// Get pointer to shared memory buffer
export fn get_shared_bytes_ptr() WasmPtr {
    if (comptime !is_wasm) return undefined;
    return WasmRuntime.getBufferPtr();
}

/// Clear shared buffer and prepare for incoming data of given size
export fn clear_shared_bytes(size: ByteLength) WasmPtr {
    if (comptime !is_wasm) return undefined;
    return WasmRuntime.clearBuffer(size);
}

/// Get plugin information as JSON
export fn get_plugin_info() ByteLength {
    if (comptime !is_wasm) return 0;
    if (!WasmRuntime.writeToBuffer(PLUGIN_INFO_JSON)) return 0;
    return @intCast(PLUGIN_INFO_JSON.len);
}

/// Get plugin license text
export fn get_license_text() ByteLength {
    if (comptime !is_wasm) return 0;
    if (!WasmRuntime.writeToBuffer(LICENSE_TEXT)) return 0;
    return @intCast(LICENSE_TEXT.len);
}

/// Register a configuration
export fn register_config(config_id: ConfigId) void {
    if (comptime !is_wasm) return;
    WasmRuntime.registerConfig(config_id);
}

/// Release a configuration
export fn release_config(config_id: ConfigId) void {
    if (comptime !is_wasm) return;
    WasmRuntime.releaseConfig(config_id);
}

/// Get configuration diagnostics as JSON array
export fn get_config_diagnostics(_: ConfigId) ByteLength {
    if (comptime !is_wasm) return 0;

    const buf = WasmRuntime.getBufferContent();
    const allocator = std.heap.wasm_allocator;
    const diag = diagnosticsForConfig(buf, allocator);
    if (!WasmRuntime.writeToBuffer(diag)) return 0;
    return @intCast(diag.len);
}

/// Get resolved configuration as JSON object
export fn get_resolved_config(_: ConfigId) ByteLength {
    if (comptime !is_wasm) return 0;
    const empty_object = "{}";
    if (!WasmRuntime.writeToBuffer(empty_object)) return 0;
    return @intCast(empty_object.len);
}

/// Store file path from shared buffer
export fn set_file_path() void {
    if (comptime !is_wasm) return;
    WasmRuntime.storeFilePath();
}

/// Store override configuration from shared buffer
export fn set_override_config() void {
    if (comptime !is_wasm) return;
    WasmRuntime.storeOverrideConfig();
}

/// Check config updates (not supported, return empty JSON array)
export fn check_config_updates() ByteLength {
    if (comptime !is_wasm) return 0;
    const empty_array = "[]";
    if (!WasmRuntime.writeToBuffer(empty_array)) return 0;
    return @intCast(empty_array.len);
}

/// Format the source code in shared buffer
export fn format(_: ConfigId) FormatResult {
    if (comptime !is_wasm) return .no_change;
    const source = WasmRuntime.getBufferContent();
    return WasmRuntime.formatSource(source);
}

/// Range format is not supported; delegates to full format
export fn format_range(config_id: ConfigId, _: u32, _: u32) FormatResult {
    return format(config_id);
}

/// Get formatted text (call after format returns .changed)
export fn get_formatted_text() ByteLength {
    if (comptime !is_wasm) return 0;
    return WasmRuntime.getFormattedText();
}

/// Get error text (call after format returns .error)
export fn get_error_text() ByteLength {
    if (comptime !is_wasm) return 0;
    return WasmRuntime.getErrorText();
}

/// Get file matching info for this config
export fn get_config_file_matching(_: ConfigId) ByteLength {
    if (comptime !is_wasm) return 0;
    if (!WasmRuntime.writeToBuffer(FILE_MATCHING_JSON)) return 0;
    return @intCast(FILE_MATCHING_JSON.len);
}

// =============================================================================
// Tests (native target only)
// =============================================================================

const zig_formatted_fixture =
    \\const std = @import("std");
    \\pub fn add(a: i32, b: i32) i32 {
    \\    return a + b;
    \\}
    \\
;

const zig_unformatted_fixture = "const std=@import(\"std\");pub fn add(a:i32,b:i32)i32{return a+b;}";
const zig_invalid_fixture = "pub fn main() { let = 1; }";

const zon_formatted_fixture = ".{ .name = \"zig\", .values = .{ 1, 2, 3 } }\n";
const zon_unformatted_fixture = ".{.name=\"zig\",.values=.{1,2,3}}";
const zon_invalid_fixture = ".{ .name = \"zig\", .values = .{ 1, 2, 3 }";

test "PluginInfo JSON is valid and contains required fields" {
    const json = PLUGIN_INFO_JSON;

    // Parse the JSON to verify it's valid
    const parsed = try std.json.parseFromSlice(PluginInfo, std.testing.allocator, json, .{});
    defer parsed.deinit();

    // Verify the parsed values match our constants
    try std.testing.expectEqualStrings("dprint-plugin-zig", parsed.value.name);
    try std.testing.expectEqualStrings(plugin_info.version, parsed.value.version);
    try std.testing.expectEqualStrings("zig", parsed.value.configKey);
    try std.testing.expectEqual(@as(usize, 2), parsed.value.fileExtensions.len);
    try std.testing.expectEqualStrings("zig", parsed.value.fileExtensions[0]);
    try std.testing.expectEqualStrings("zon", parsed.value.fileExtensions[1]);
}

test "FileMatchingInfo JSON is valid and contains required fields" {
    const json = FILE_MATCHING_JSON;

    // Parse the JSON to verify it's valid
    const parsed = try std.json.parseFromSlice(FileMatchingInfo, std.testing.allocator, json, .{});
    defer parsed.deinit();

    // Verify the parsed values
    try std.testing.expectEqual(@as(usize, 2), parsed.value.fileExtensions.len);
    try std.testing.expectEqualStrings("zig", parsed.value.fileExtensions[0]);
    try std.testing.expectEqualStrings("zon", parsed.value.fileExtensions[1]);
    try std.testing.expectEqual(@as(usize, 0), parsed.value.fileNames.len);
}

test "format simple zig code" {
    const allocator = std.testing.allocator;
    const input = zig_formatted_fixture;

    var ast = try std.zig.Ast.parse(allocator, input, .zig);
    defer ast.deinit(allocator);

    const result = try ast.renderAlloc(allocator);
    defer allocator.free(result);

    try std.testing.expectEqualStrings(zig_formatted_fixture, result);
}

test "format function" {
    const allocator = std.testing.allocator;
    const input = "fn foo()void{}";

    var ast = try std.zig.Ast.parse(allocator, input, .zig);
    defer ast.deinit(allocator);

    const result = try ast.renderAlloc(allocator);
    defer allocator.free(result);

    try std.testing.expect(std.mem.indexOf(u8, result, "fn foo() void {") != null);
}

test "format zon fixture" {
    const allocator = std.testing.allocator;
    const input = zon_formatted_fixture;
    var ast = try std.zig.Ast.parse(allocator, input, .zon);
    defer ast.deinit(allocator);
    try std.testing.expectEqual(@as(usize, 0), ast.errors.len);
    const result = try ast.renderAlloc(allocator);
    defer allocator.free(result);
    try std.testing.expectEqualStrings(zon_formatted_fixture, result);
}

test "zig unformatted becomes formatted" {
    const allocator = std.testing.allocator;
    var ast = try std.zig.Ast.parse(allocator, zig_unformatted_fixture, .zig);
    defer ast.deinit(allocator);
    try std.testing.expectEqual(@as(usize, 0), ast.errors.len);
    const result = try ast.renderAlloc(allocator);
    defer allocator.free(result);
    try std.testing.expectEqualStrings(zig_formatted_fixture, result);
}

test "zon unformatted becomes formatted" {
    const allocator = std.testing.allocator;
    var ast = try std.zig.Ast.parse(allocator, zon_unformatted_fixture, .zon);
    defer ast.deinit(allocator);
    try std.testing.expectEqual(@as(usize, 0), ast.errors.len);
    const result = try ast.renderAlloc(allocator);
    defer allocator.free(result);
    try std.testing.expectEqualStrings(zon_formatted_fixture, result);
}

test "zig invalid produces parse errors" {
    const allocator = std.testing.allocator;
    var ast = try std.zig.Ast.parse(allocator, zig_invalid_fixture, .zig);
    defer ast.deinit(allocator);
    try std.testing.expect(ast.errors.len > 0);
}

test "zon invalid produces parse errors" {
    const allocator = std.testing.allocator;
    var ast = try std.zig.Ast.parse(allocator, zon_invalid_fixture, .zon);
    defer ast.deinit(allocator);
    try std.testing.expect(ast.errors.len > 0);
}

test "LICENSE file embedded" {
    try std.testing.expect(std.mem.indexOf(u8, LICENSE_TEXT, "MIT License") != null);
    try std.testing.expect(std.mem.indexOf(u8, LICENSE_TEXT, "Kaj Kowalski") != null);
}

test "FormatResult enum values match dprint spec" {
    try std.testing.expectEqual(@as(u32, 0), @intFromEnum(FormatResult.no_change));
    try std.testing.expectEqual(@as(u32, 1), @intFromEnum(FormatResult.changed));
    try std.testing.expectEqual(@as(u32, 2), @intFromEnum(FormatResult.@"error"));
}

test "resolveModeFromPath chooses zon for .zon" {
    try std.testing.expectEqual(std.zig.Ast.Mode.zon, resolveModeFromPath("file.zon"));
    try std.testing.expectEqual(std.zig.Ast.Mode.zig, resolveModeFromPath("file.zig"));
}

test "diagnosticsForConfig handles empty, invalid, and unknown" {
    const allocator = std.testing.allocator;
    try std.testing.expectEqualStrings("[]", diagnosticsForConfig("", allocator));
    try std.testing.expectEqualStrings("[\"Invalid JSON override config\"]", diagnosticsForConfig("{", allocator));
    try std.testing.expectEqualStrings("[\"Unknown configuration properties are not supported\"]", diagnosticsForConfig("{\"x\":1}", allocator));
    try std.testing.expectEqualStrings("[]", diagnosticsForConfig("{}", allocator));
}

test "buildParseErrorMessage reports line and column" {
    const allocator = std.testing.allocator;
    const src = "const =";
    var ast = try std.zig.Ast.parse(allocator, src, .zig);
    defer ast.deinit(allocator);
    try std.testing.expect(ast.errors.len > 0);
    const msg = try buildParseErrorMessage(allocator, src, "main.zig", ast.tokens.items(.start), ast.errors);
    defer allocator.free(msg);
    try std.testing.expect(std.mem.indexOf(u8, msg, "main.zig:1:") != null);
}

const std: type = @import("std");
const builtin: type = @import("builtin");

const is_wasm: bool = builtin.cpu.arch == .wasm32;

// =============================================================================
// Constants
// =============================================================================

const PLUGIN_NAME = "dprint-plugin-zig";
const PLUGIN_VERSION = "0.1.0";
const CONFIG_KEY = "zig";
const HELP_URL = "https://github.com/kjanat/dprint-plugin-zig";
const LICENSE_TEXT =
    \\MIT License
    \\
    \\Copyright (c) 2025 Kaj Kowalski
    \\
    \\Permission is hereby granted, free of charge, to any person obtaining a copy
    \\of this software and associated documentation files (the "Software"), to deal
    \\in the Software without restriction, including without limitation the rights
    \\to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    \\copies of the Software, and to permit persons to whom the Software is
    \\furnished to do so, subject to the following conditions:
    \\
    \\The above copyright notice and this permission notice shall be included in all
    \\copies or substantial portions of the Software.
    \\
    \\THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    \\IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    \\FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    \\AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    \\LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    \\OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
    \\SOFTWARE.
;

const PLUGIN_INFO =
    \\{"name":"
++ PLUGIN_NAME ++
    \\","version":"
++ PLUGIN_VERSION ++
    \\","configKey":"
++ CONFIG_KEY ++
    \\","fileExtensions":["zig","zon"],"fileNames":[],"helpUrl":"
++ HELP_URL ++
    \\","configSchemaUrl":""}
;

// =============================================================================
// Wasm-specific code (only compiled for wasm32)
// =============================================================================

const wasm: type = if (is_wasm) struct {
    const WASM_PAGE_SIZE = 65536;

    var heap_base: [*]u8 = undefined;
    var heap_end: [*]u8 = undefined;
    var heap_ptr: [*]u8 = undefined;
    var heap_initialized: bool = false;

    fn alloc(len: usize) ?[*]u8 {
        const aligned_len = (len + 7) & ~@as(usize, 7); // 8-byte alignment
        const current: [*]u8 = heap_ptr;
        const new_ptr: [*]u8 = @as([*]u8, @ptrFromInt(@intFromPtr(heap_ptr) + aligned_len));

        if (@intFromPtr(new_ptr) > @intFromPtr(heap_end)) {
            // Need more pages
            const pages_needed: usize = (aligned_len + WASM_PAGE_SIZE - 1) / WASM_PAGE_SIZE;
            const result: isize = @wasmMemoryGrow(0, pages_needed);
            if (result == -1) return null;
            heap_end = @as([*]u8, @ptrFromInt(@intFromPtr(heap_end) + pages_needed * WASM_PAGE_SIZE));
        }

        heap_ptr = new_ptr;
        return current;
    }

    fn allocSlice(len: usize) ?[]u8 {
        const ptr = alloc(len) orelse return null;
        return ptr[0..len];
    }

    fn initHeap() void {
        const pages = @wasmMemorySize(0);
        heap_base = @as([*]u8, @ptrFromInt(pages * WASM_PAGE_SIZE));
        heap_end = heap_base;
        heap_ptr = heap_base;

        // Grow initial pages
        _ = @wasmMemoryGrow(0, 16); // 1MB initial heap
        heap_end = @as([*]u8, @ptrFromInt(@intFromPtr(heap_base) + 16 * WASM_PAGE_SIZE));
    }

    fn ensureHeapInitialized() void {
        if (!heap_initialized) {
            initHeap();
            heap_initialized = true;
        }
    }

    // Shared Buffer (for host communication)
    var shared_buffer: []u8 = &.{};
    var shared_buffer_capacity: usize = 0;
    var shared_buffer_len: usize = 0; // actual content length

    fn ensureSharedBufferCapacity(size: usize) bool {
        ensureHeapInitialized();
        if (shared_buffer_capacity < size) {
            const new_buf = allocSlice(size) orelse return false;
            shared_buffer = new_buf;
            shared_buffer_capacity = size;
        }
        return true;
    }

    fn setSharedBuffer(data: []const u8) bool {
        if (!ensureSharedBufferCapacity(data.len)) return false;
        @memcpy(shared_buffer[0..data.len], data);
        shared_buffer_len = data.len;
        return true;
    }

    fn setSharedBufferLen(len: usize) void {
        shared_buffer_len = len;
    }

    fn getSharedBufferContent() []u8 {
        return shared_buffer[0..shared_buffer_len];
    }

    // Plugin State
    var file_path_buf: []u8 = &.{};
    var file_path_len: usize = 0;
    var override_config_buf: []u8 = &.{};
    var override_config_len: usize = 0;

    var formatted_buf: []u8 = &.{};
    var formatted_len: usize = 0;

    var error_buf: []u8 = &.{};
    var error_len: usize = 0;

    var source_buf: []u8 = &.{};
    var source_len: usize = 0;

    // Config storage (simple, just track if registered)
    var config_registered: [16]bool = [_]bool{false} ** 16;

    /// Format Zig source code. Returns true on success.
    fn formatZigCode(source: []const u8) bool {
        ensureHeapInitialized();

        // Use wasm allocator for std.zig.Ast (Zig 0.15+ API)
        const allocator = std.heap.wasm_allocator;

        // Create sentinel-terminated copy for the parser
        const source_z = allocator.allocSentinel(u8, source.len, 0) catch {
            setError("Out of memory");
            return false;
        };
        defer allocator.free(source_z);
        @memcpy(source_z, source);

        var ast = std.zig.Ast.parse(allocator, source_z, .zig) catch {
            setError("Failed to parse Zig source");
            return false;
        };
        defer ast.deinit(allocator);

        // Check for parse errors
        if (ast.errors.len > 0) {
            setError("Parse error in Zig source");
            return false;
        }

        // Render formatted output (Zig 0.15+ API: renderAlloc)
        const rendered = ast.renderAlloc(allocator) catch {
            setError("Failed to render formatted code");
            return false;
        };

        // Store in formatted buffer
        const new_buf = allocSlice(rendered.len) orelse {
            setError("Out of memory");
            allocator.free(rendered);
            return false;
        };
        @memcpy(new_buf, rendered);
        formatted_buf = new_buf;
        formatted_len = rendered.len;

        allocator.free(rendered);
        return true;
    }

    fn setError(msg: []const u8) void {
        ensureHeapInitialized();
        const buf = allocSlice(msg.len) orelse return;
        @memcpy(buf, msg);
        error_buf = buf;
        error_len = msg.len;
    }
} else struct {};

// =============================================================================
// dprint Schema v4 Exports (wasm only)
// =============================================================================

/// Returns 4 to indicate schema version 4 support
export fn dprint_plugin_version_4() u32 {
    return 4;
}

/// Returns pointer to shared buffer for host communication
export fn get_shared_bytes_ptr() [*]const u8 {
    if (comptime !is_wasm) return undefined;
    wasm.ensureHeapInitialized();
    if (wasm.shared_buffer.len == 0) {
        _ = wasm.ensureSharedBufferCapacity(1024);
    }
    return wasm.shared_buffer.ptr;
}

/// Clears and resizes shared buffer, returns pointer
export fn clear_shared_bytes(size: u32) [*]const u8 {
    if (comptime !is_wasm) return undefined;
    wasm.ensureHeapInitialized();
    if (!wasm.ensureSharedBufferCapacity(size)) {
        return wasm.shared_buffer.ptr;
    }
    @memset(wasm.shared_buffer[0..size], 0);
    wasm.setSharedBufferLen(size); // track actual content length
    return wasm.shared_buffer.ptr;
}

/// Returns plugin info as JSON, stores in shared buffer
export fn get_plugin_info() u32 {
    if (comptime !is_wasm) return 0;
    if (!wasm.setSharedBuffer(PLUGIN_INFO)) return 0;
    return PLUGIN_INFO.len;
}

/// Returns license text, stores in shared buffer
export fn get_license_text() u32 {
    if (comptime !is_wasm) return 0;
    if (!wasm.setSharedBuffer(LICENSE_TEXT)) return 0;
    return LICENSE_TEXT.len;
}

/// Registers configuration from shared buffer
export fn register_config(config_id: u32) void {
    if (comptime !is_wasm) return;
    if (config_id < 16) {
        wasm.config_registered[config_id] = true;
    }
}

/// Releases configuration from memory
export fn release_config(config_id: u32) void {
    if (comptime !is_wasm) return;
    if (config_id < 16) {
        wasm.config_registered[config_id] = false;
    }
}

/// Returns config diagnostics as JSON
export fn get_config_diagnostics(_: u32) u32 {
    if (comptime !is_wasm) return 0;
    const empty = "[]";
    if (!wasm.setSharedBuffer(empty)) return 0;
    return empty.len;
}

/// Returns resolved configuration as JSON
export fn get_resolved_config(_: u32) u32 {
    if (comptime !is_wasm) return 0;
    const empty = "{}";
    if (!wasm.setSharedBuffer(empty)) return 0;
    return empty.len;
}

/// Takes file path from shared buffer and stores it
export fn set_file_path() void {
    if (comptime !is_wasm) return;
    wasm.ensureHeapInitialized();
    const len = wasm.shared_buffer.len;
    const buf = wasm.allocSlice(len) orelse return;
    @memcpy(buf, wasm.shared_buffer[0..len]);
    wasm.file_path_buf = buf;
    wasm.file_path_len = len;
}

/// Takes override config from shared buffer
export fn set_override_config() void {
    if (comptime !is_wasm) return;
    wasm.ensureHeapInitialized();
    const len = wasm.shared_buffer.len;
    const buf = wasm.allocSlice(len) orelse return;
    @memcpy(buf, wasm.shared_buffer[0..len]);
    wasm.override_config_buf = buf;
    wasm.override_config_len = len;
}

/// Format the file. Returns: 0=no change, 1=changed, 2=error
export fn format(_: u32) u32 {
    if (comptime !is_wasm) return 0;
    wasm.ensureHeapInitialized();

    // Source is in shared_buffer with length tracked by clear_shared_bytes
    const source = wasm.getSharedBufferContent();
    const src_len = source.len;

    if (src_len == 0) {
        return 0; // empty file, no change
    }

    // Store source for comparison
    const src_copy = wasm.allocSlice(src_len) orelse {
        wasm.setError("Out of memory");
        return 2;
    };
    @memcpy(src_copy, source);
    wasm.source_buf = src_copy;
    wasm.source_len = src_len;

    if (!wasm.formatZigCode(src_copy)) {
        return 2; // error
    }

    // Check if content changed
    if (wasm.formatted_len == src_len) {
        if (std.mem.eql(u8, wasm.source_buf[0..wasm.source_len], wasm.formatted_buf[0..wasm.formatted_len])) {
            return 0; // no change
        }
    }

    return 1; // changed
}

/// Returns formatted text length, stores in shared buffer
export fn get_formatted_text() u32 {
    if (comptime !is_wasm) return 0;
    if (wasm.formatted_len == 0) return 0;
    if (!wasm.setSharedBuffer(wasm.formatted_buf[0..wasm.formatted_len])) return 0;
    return @intCast(wasm.formatted_len);
}

/// Returns error text length, stores in shared buffer
export fn get_error_text() u32 {
    if (comptime !is_wasm) return 0;
    if (wasm.error_len == 0) return 0;
    if (!wasm.setSharedBuffer(wasm.error_buf[0..wasm.error_len])) return 0;
    return @intCast(wasm.error_len);
}

/// Returns config file matching patterns as JSON
export fn get_config_file_matching(_: u32) u32 {
    if (comptime !is_wasm) return 0;
    // Return file matching info (extensions/names the plugin handles)
    const file_matching =
        \\{"fileExtensions":["zig","zon"],"fileNames":[]}
    ;
    if (!wasm.setSharedBuffer(file_matching)) return 0;
    return file_matching.len;
}

// =============================================================================
// Tests (native only)
// =============================================================================

test "format simple zig code" {
    const allocator = std.testing.allocator;
    const input = "const x=1;";

    var ast = try std.zig.Ast.parse(allocator, input, .zig);
    defer ast.deinit(allocator);

    const result = try ast.renderAlloc(allocator);
    defer allocator.free(result);

    try std.testing.expectEqualStrings("const x = 1;\n", result);
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

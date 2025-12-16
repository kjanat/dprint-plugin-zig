const std = @import("std");
const build_zig_zon = @import("build.zig.zon");

// =============================================================================
// Comptime Constants from build.zig.zon
// =============================================================================

const version = build_zig_zon.version;

/// Plugin name with underscores replaced by hyphens
const name = blk: {
    const raw = @tagName(build_zig_zon.name);
    var result: [raw.len]u8 = undefined;
    for (raw, 0..) |c, i| {
        result[i] = if (c == '_') '-' else c;
    }
    const final = result;
    break :blk &final;
};

/// Expected plugin URL pattern in README.md
const expected_url = std.fmt.comptimePrint(
    "https://plugins.dprint.dev/kjanat/zig-{s}.wasm",
    .{version},
);

// =============================================================================
// Build
// =============================================================================

pub fn build(b: *std.Build) void {
    const optimize = b.standardOptimizeOption(.{});

    const wasm_target = b.resolveTargetQuery(.{
        .cpu_arch = .wasm32,
        .os_tag = .freestanding,
    });

    // Build options from build.zig.zon
    const options = b.addOptions();
    options.addOption([]const u8, "name", name);
    options.addOption([]const u8, "version", version);

    const wasm_module = b.createModule(.{
        .root_source_file = b.path("src/main.zig"),
        .target = wasm_target,
        .optimize = .ReleaseSmall,
        .strip = true,
        .imports = &.{.{ .name = "build_options", .module = options.createModule() }},
    });

    const wasm = b.addExecutable(.{
        .name = "plugin",
        .root_module = wasm_module,
    });

    // Export memory for dprint host communication
    wasm.entry = .disabled;
    wasm.rdynamic = true;

    b.installArtifact(wasm);

    // Run tests on native target
    const native_target = b.resolveTargetQuery(.{});

    const test_module = b.createModule(.{
        .root_source_file = b.path("src/main.zig"),
        .target = native_target,
        .optimize = optimize,
        .imports = &.{.{ .name = "build_options", .module = options.createModule() }},
    });

    const unit_tests = b.addTest(.{
        .root_module = test_module,
    });

    const run_unit_tests = b.addRunArtifact(unit_tests);
    const test_step = b.step("test", "Run unit tests");
    test_step.dependOn(&run_unit_tests.step);

    // README version validation/update step
    const readme_step = b.step("readme", "Validate/update README.md version");
    const readme_check = ReadmeVersionStep.create(b);
    readme_step.dependOn(&readme_check.step);

    // Make default build depend on readme check
    b.default_step.dependOn(&readme_check.step);
}

// =============================================================================
// README Version Check Step
// =============================================================================

const ReadmeVersionStep = struct {
    step: std.Build.Step,
    builder: *std.Build,

    const Self = @This();
    const url_pattern = "https://plugins.dprint.dev/kjanat/zig-";

    fn create(b: *std.Build) *Self {
        const self = b.allocator.create(Self) catch @panic("OOM");
        self.* = .{
            .step = std.Build.Step.init(.{
                .id = .custom,
                .name = "check README.md version",
                .owner = b,
                .makeFn = make,
            }),
            .builder = b,
        };
        return self;
    }

    fn make(step: *std.Build.Step, _: std.Build.Step.MakeOptions) !void {
        const self: *Self = @fieldParentPtr("step", step);
        const b = self.builder;

        // Environment detection
        const is_ci = std.process.getEnvVarOwned(b.allocator, "CI") catch null;
        const is_github_actions = std.process.getEnvVarOwned(b.allocator, "GITHUB_ACTIONS") catch null;
        const step_summary_path = std.process.getEnvVarOwned(b.allocator, "GITHUB_STEP_SUMMARY") catch null;

        const readme_path = b.pathFromRoot("README.md");
        const readme_content = std.fs.cwd().readFileAlloc(b.allocator, readme_path, 1024 * 1024) catch |err| {
            return step.fail("Failed to read README.md: {}", .{err});
        };

        // Find URL pattern and extract info
        const start_idx = std.mem.indexOf(u8, readme_content, url_pattern) orelse {
            return step.fail("Could not find plugin URL pattern in README.md", .{});
        };
        const after_pattern = readme_content[start_idx + url_pattern.len ..];
        const version_end = std.mem.indexOf(u8, after_pattern, ".wasm") orelse {
            return step.fail("Could not find .wasm suffix in README.md URL", .{});
        };

        const found_version = after_pattern[0..version_end];
        const line_number = getLineNumber(readme_content, start_idx);
        const versions_match = std.mem.eql(u8, found_version, version);

        // Version matches - emit notice in GitHub Actions
        if (versions_match) {
            if (is_github_actions != null) {
                emitGitHubNotice(line_number, version, b.allocator);
            }
            return;
        }

        // Version mismatch
        if (is_github_actions != null) {
            emitGitHubError(line_number, found_version, b.allocator);
            writeStepSummary(step_summary_path, found_version, b.allocator);
            return step.fail("README.md version mismatch (see GitHub Actions annotation)", .{});
        }

        if (is_ci != null) {
            return step.fail(
                \\README.md version mismatch!
                \\Expected URL: {s}
                \\Found: zig-{s}.wasm
                \\Please update README.md to match build.zig.zon version.
            , .{ expected_url, found_version });
        }

        // Not in CI - auto-update README
        const prefix = readme_content[0 .. start_idx + url_pattern.len];
        const suffix = after_pattern[version_end..];
        const new_len = prefix.len + version.len + suffix.len;
        const new_content = b.allocator.alloc(u8, new_len) catch @panic("OOM");
        @memcpy(new_content[0..prefix.len], prefix);
        @memcpy(new_content[prefix.len..][0..version.len], version);
        @memcpy(new_content[prefix.len + version.len ..], suffix);

        std.fs.cwd().writeFile(.{
            .sub_path = readme_path,
            .data = new_content,
        }) catch |err| {
            return step.fail("Failed to write README.md: {}", .{err});
        };

        step.result_cached = false;
        std.log.warn("Updated README.md plugin URL to version {s}", .{version});
    }

    /// Count newlines to get 1-based line number
    fn getLineNumber(content: []const u8, byte_offset: usize) usize {
        var line: usize = 1;
        for (content[0..byte_offset]) |c| {
            if (c == '\n') line += 1;
        }
        return line;
    }

    /// Emit GitHub Actions notice annotation (version OK)
    fn emitGitHubNotice(line_number: usize, ver: []const u8, allocator: std.mem.Allocator) void {
        const msg = std.fmt.allocPrint(
            allocator,
            "::notice file=README.md,line={d},title=README Version OK::Plugin URL matches build.zig.zon ({s})\n",
            .{ line_number, ver },
        ) catch return;
        std.fs.File.stdout().writeAll(msg) catch {};
    }

    /// Emit GitHub Actions error annotation (version mismatch)
    fn emitGitHubError(line_number: usize, found_ver: []const u8, allocator: std.mem.Allocator) void {
        const msg = std.fmt.allocPrint(
            allocator,
            "::error file=README.md,line={d},title=Version Mismatch::Expected zig-{s}.wasm, found zig-{s}.wasm\n",
            .{ line_number, version, found_ver },
        ) catch return;
        std.fs.File.stdout().writeAll(msg) catch {};
    }

    /// Write GitHub Actions step summary (graceful skip on failure)
    fn writeStepSummary(summary_path: ?[]const u8, found_ver: []const u8, allocator: std.mem.Allocator) void {
        const path = summary_path orelse return;
        const file = std.fs.cwd().createFile(path, .{ .truncate = false }) catch return;
        defer file.close();
        file.seekFromEnd(0) catch return;
        const content = std.fmt.allocPrint(allocator,
            \\## README Version Mismatch
            \\
            \\| Expected | Found |
            \\|----------|-------|
            \\| `zig-{s}.wasm` | `zig-{s}.wasm` |
            \\
            \\Update `README.md` plugin URL to match `build.zig.zon` version.
            \\
        , .{ version, found_ver }) catch return;
        file.writeAll(content) catch {};
    }
};

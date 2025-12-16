# Agent Guidelines for dprint-plugin-zig

## Build Commands
- `zig build` - Build wasm plugin to `zig-out/bin/dprint-plugin-zig.wasm`
- `zig build -Doptimize=ReleaseSmall` - Optimized/smaller wasm build
- `zig build test` - Run all tests (native target, not wasm)
- Single test: `zig build test --test-filter "test name"` or use `zig test src/main.zig --test-filter "name"`

## Code Style (Zig 0.15.2)
- Imports: `std` first, then `builtin`, then project imports; group with blank lines
- Types: Use semantic type aliases (`ByteLength`, `WasmPtr`, `ConfigId`) over raw primitives
- Naming: `snake_case` functions/vars, `PascalCase` types, `SCREAMING_CASE` comptime constants
- Enums: Use Zig enum syntax with explicit backing type when needed (e.g., `enum(u32)`)
- Errors: Return `!T` for fallible functions; use `catch` with explicit handling
- Comments: Use `///` for doc comments, `//` for inline; add section headers with `// ===`
- Comptime: Prefer comptime evaluation for static data (JSON metadata, embedded files)
- Wasm: Use `builtin.cpu.arch == .wasm32` for conditional compilation
- Tests: Place tests at end of file with `test "descriptive name"` blocks; native-only

## Architecture
- Single source file: `src/main.zig` (wasm plugin, ~520 lines)
- Target: `wasm32-freestanding` with `entry = .disabled`, `rdynamic = true`
- Implements dprint Wasm Plugin Schema v4 (16 exports)
- Uses `std.zig.Ast` for parsing/formatting

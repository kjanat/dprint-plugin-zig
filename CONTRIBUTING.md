# Contributing to dprint-plugin-zig

## How It Works

This plugin implements the [dprint Wasm Plugin Schema v4][schema]. The entire
plugin is a single file (`src/main.zig`, ~520 lines) that compiles to
WebAssembly.

**Flow:**

1. dprint host loads the wasm module and calls exported functions
2. `format()` receives Zig source via shared memory buffer
3. Source is parsed with `std.zig.Ast.parse()`
4. AST is rendered back with `ast.renderAlloc()`
5. Result returned: `no_change`, `changed`, or `error`

**Key exports:** `get_plugin_info`, `set_file_path`, `format`,
`get_formatted_text`, `get_error_text`

## Development

```bash
# Build wasm plugin (outputs to zig-out/bin/plugin.wasm)
zig build

# Run tests (native target, not wasm)
zig build test

# Run single test
zig build test -- --test-filter "test name"
```

Test locally with dprint:

```json
{
  "zig": {},
  "plugins": ["./zig-out/bin/plugin.wasm"]
}
```

## Code Structure

- **Type aliases**: `ByteLength`, `WasmPtr`, `ConfigId`, `FormatResult`
- **Comptime JSON**: Plugin metadata serialized at compile time
- **Conditional compilation**: `builtin.cpu.arch == .wasm32` for wasm-specific
  code
- **Tests**: At end of file, run on native target only

## Things to Know

- No runtime allocator in wasm - uses static buffers for host communication
- `std.zig.Ast` handles all parsing/formatting - we're just a thin wrapper
- Version is in `PluginInfo.version` (bump for releases)
- `schema.json` defines config options (currently empty)

[schema]: https://github.com/dprint/dprint/blob/main/docs/wasm-plugin-development.md

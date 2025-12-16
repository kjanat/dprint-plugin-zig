# dprint-plugin-zig

A [dprint][dprint] formatting plugin for Zig, written in Zig.

Uses Zig's built-in `std.zig.Ast` parser and renderer to provide consistent
formatting through dprint.

## Installation

Add to your `dprint.json`:

```json
{
  "zig": {},
  "plugins": [
    "https://plugins.dprint.dev/kjanat/zig-<VERSION>.wasm"
  ]
}
```

<details>
<summary>Or use local build:</summary>

```json
{
  "zig": {},
  "plugins": [
    "./zig-out/bin/plugin.wasm"
  ]
}
```

</details>

## Usage

Format Zig files:

```bash
dprint fmt "**/*.zig"
```

Check formatting:

```bash
dprint check "**/*.zig"
```

## Building from Source

Requires Zig 0.15.2 or later.

```bash
# Build wasm plugin
zig build

# Build with optimizations (smaller wasm)
zig build -Doptimize=ReleaseSmall

# Run tests
zig build test
```

The plugin will be output to `zig-out/bin/plugin.wasm`.

## Configuration

Currently no configuration options.\
The plugin uses Zig's default formatting rules.

## How It Works

This plugin implements the [dprint Wasm Plugin Schema v4][dprint-v4].

It:

1. Receives Zig source code from dprint
2. Parses it using `std.zig.Ast`
3. Renders the AST back to formatted source using `ast.renderAlloc()`
4. Returns the formatted code (or signals no change if identical)

## File Types

Matches files with:

- Extensions: `.zig`, `.zon`

## License

[MIT][LICENSE]

[LICENSE]: https://github.com/kjanat/dprint-plugin-zig/blob/master/LICENSE
[dprint-v4]: https://github.com/dprint/dprint/blob/main/docs/wasm-plugin-development.md
[dprint]: https://dprint.dev/

<!-- markdownlint-disable-file MD033 -->

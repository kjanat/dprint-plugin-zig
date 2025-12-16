# dprint-plugin-zig

[![Release][badge:ci:release]][actions:release] [![JSR][badge:jsr]][jsr]
[![npm][badge:npm]][npm]

A [dprint][dprint] formatting plugin for Zig, written in Zig.

Wraps Zig's built-in `std.zig.Ast` formatter in a tiny (~140KB) WebAssembly
module, giving you the official Zig formatting style through dprint's unified
interface.

## Installation

```bash
dprint config add kjanat/zig
```

Or manually add to your `dprint.json`:

```json
{
  "zig": {},
  "plugins": [
    "https://plugins.dprint.dev/kjanat/zig-0.1.2.wasm"
  ]
}
```

## Usage

```bash
dprint fmt "**/*.zig"
```

## Why?

- **Consistent formatting** - Same output as `zig fmt`
- **Unified tooling** - One formatter for Zig, TypeScript, JSON, Markdown, etc.
- **Fast** - Native Wasm execution, no external process spawning
- **Tiny** - ~140KB plugin size

## File Types

- `.zig` - Zig source files
- `.zon` - Zig Object Notation (build.zig.zon, etc.)

## Configuration

Currently uses Zig's default formatting rules with no configuration options.\
The formatter produces identical output to `zig fmt`.

## Contributing

See [CONTRIBUTING][contributing] for build instructions and development info.

## License

[MIT][license]

<!-- link definitions -->

[actions:release]: https://github.com/kjanat/dprint-plugin-zig/actions/workflows/release.yml
[badge:ci:release]: https://img.shields.io/github/actions/workflow/status/kjanat/dprint-plugin-zig/release.yml?logo=githubactions&logoColor=2088FF&logoSize=auto&label=Release&labelColor=181717
[badge:jsr]: https://img.shields.io/jsr/v/@kjanat/dprint-zig?logo=jsr&logoColor=black&logoSize=auto&label=&labelColor=F7DF1E&color=black
[badge:npm]: https://img.shields.io/npm/v/@kjanat/dprint-zig?logo=npm&logoColor=white&logoSize=auto&label=&labelColor=CB3837&color=black
[contributing]: https://github.com/kjanat/dprint-plugin-zig/blob/master/CONTRIBUTING.md
[dprint]: https://dprint.dev/
[jsr]: https://jsr.io/@kjanat/dprint-zig
[license]: https://github.com/kjanat/dprint-plugin-zig/blob/master/LICENSE
[npm]: https://www.npmjs.com/package/@kjanat/dprint-zig

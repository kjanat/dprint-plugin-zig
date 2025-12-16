# @kjanat/dprint-zig

[![JSR][badge:jsr]][jsr] [![npm][badge:npm]][npm]

Wasm plugin for formatting Zig code via [dprint][dprint].\
Wraps Zig's built-in [`std.zig.Ast`][zig:std.Ast] formatter.

## Install

Deno:

```bash
deno add jsr:@kjanat/dprint-zig
# or: npm:@kjanat/dprint-zig
```

Bun / Node.js (requires Node 22.16+):

```bash
bun add @kjanat/dprint-zig
# or: npm i @kjanat/dprint-zig
```

## Usage

### Node.js

```ts
import { createFromBuffer } from "@dprint/formatter";
import { getPath } from "@kjanat/dprint-zig";
import { readFileSync } from "node:fs";

const buffer = readFileSync(getPath());
const formatter = createFromBuffer(buffer);

console.log(formatter.formatText("main.zig", "const x=1;"));
// => "const x = 1;\n"
```

### Deno

```ts
import { createFromBuffer } from "@dprint/formatter";
import { getPath } from "@kjanat/dprint-zig";

const buffer = await Deno.readFile(getPath());
const formatter = createFromBuffer(buffer);

console.log(formatter.formatText("main.zig", "const x=1;"));
// => "const x = 1;\n"
```

## API

### `getPath(): string`

Returns the absolute path to the bundled `plugin.wasm` file.

## Configuration

No configuration options. Zig enforces a single canonical style, producing
identical output to `zig fmt`.

## File Types

- `.zig` - Zig source files
- `.zon` - Zig Object Notation (`build.zig.zon`, etc.)

## Links

- [Main repository][repo]
- [@dprint/formatter][dprint-formatter]
- [dprint documentation][dprint]

## License

[MIT][license]

<!-- link definitions -->

[badge:jsr]: https://img.shields.io/jsr/v/@kjanat/dprint-zig?logo=jsr&logoColor=black&logoSize=auto&label=&labelColor=F7DF1E&color=black
[badge:npm]: https://img.shields.io/npm/v/@kjanat/dprint-zig?logo=npm&logoColor=white&logoSize=auto&label=&labelColor=CB3837&color=black
[dprint]: https://dprint.dev/
[dprint-formatter]: https://www.npmjs.com/package/@dprint/formatter
[jsr]: https://jsr.io/@kjanat/dprint-zig
[license]: https://github.com/kjanat/dprint-plugin-zig/blob/master/LICENSE
[npm]: https://www.npmjs.com/package/@kjanat/dprint-zig
[repo]: https://github.com/kjanat/dprint-plugin-zig
[zig:std.Ast]: https://ziglang.org/documentation/master/std/#std.zig.Ast

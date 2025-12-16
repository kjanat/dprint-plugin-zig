/**
 * @module
 * Generates GitHub release notes for dprint-plugin-zig.
 *
 * Uses dprint's changelog automation to generate markdown-formatted
 * release notes including changes, install instructions, and links.
 *
 * @example Usage
 * ```sh
 * deno run -A scripts/generate_release_notes.ts 0.2.1 > release_notes.md
 * ```
 */

import { generateChangeLog } from "changelog";

const plugin = "kjanat/zig";

const URLS = {
  dprintInstall: "https://dprint.dev/install/",
  dprintSetup: "https://dprint.dev/setup/",
  jsFormatter: "https://github.com/dprint/js-formatter",
  npmPackage: "https://www.npmjs.com/package/@kjanat/dprint-zig",
  pluginBase: `https://plugins.dprint.dev/${plugin}`,
} as const;

function mdCode(snippet: string): string {
  return `\`${snippet}\``;
}

function mdCodeBlock(
  snippet: string,
  language: string = "",
  indent: string = "",
): string {
  const indentedSnippet = snippet
    .split("\n")
    .map((line) => indent + line)
    .join("\n");
  const fence = "```";
  return `${indent}${fence}${language}\n${indentedSnippet}\n${indent}${fence}`;
}

function getMdText(url: string, version: string): string {
  return `{
  // ...etc...
  "zig": {},
  "plugins": [
    "${url}-${version}.wasm"
  ]
}`;
}

if (import.meta.main) {
  const version = Deno.args[0];
  const changelog = await generateChangeLog({
    versionTo: version,
  });

  const text = `## Changes

${changelog}

## Install

[Install](${URLS.dprintInstall}) and [setup](${URLS.dprintSetup}) dprint.

Then in your project's dprint configuration file:

1. Specify the plugin url in the ${mdCode("plugins")} array (or run ${
    mdCode(`dprint config add ${plugin}`)
  }).
2. Add a ${mdCode("zig")} configuration property if desired.

${mdCodeBlock(getMdText(URLS.pluginBase, version), "jsonc", "   ")}

## JS Formatting API

* [JS Formatter](${URLS.jsFormatter}) - Browser/Deno and Node
* [npm package](${URLS.npmPackage})
`;

  console.log(text);
}

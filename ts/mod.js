/**
 * @module
 * dprint plugin for formatting Zig code.
 *
 * @example Get the path to the Wasm plugin
 * ```ts
 * import { getPath } from "@kjanat/dprint-zig";
 * import { readFileSync } from "node:fs";
 *
 * const buffer = readFileSync(getPath());
 * ```
 */

import { join } from "node:path";

/**
 * Gets the path to the Wasm module.
 * @returns {string}
 */
export const getPath = () => join(import.meta.dirname, "plugin.wasm");

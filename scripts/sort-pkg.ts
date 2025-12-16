#!/usr/bin/env -S deno run --allow-read
/**
 * @module
 * Sorts package.json, jsr.json, and deno.json files.
 *
 * Reads JSON from stdin and outputs sorted JSON to stdout.
 * Accepts filepath as argument to determine sort order.
 *
 * @example Usage
 * ```sh
 * cat package.json | deno run -A scripts/sort-pkg.ts package.json
 * cat jsr.json | deno run -A scripts/sort-pkg.ts ts/jsr.json
 * cat deno.json | deno run -A scripts/sort-pkg.ts deno.json
 * ```
 */

import { sortPackageJson } from "sort-package-json";

// =============================================================================
// Sort Orders (exported for testing)
// =============================================================================

/** JSR package config field order. */
export const JSR_SORT_ORDER = [
  "$schema",
  "name",
  "version",
  "license",
  "exports",
  "publish",
  "include",
  "exclude",
];

/** Deno config field order. */
export const DENO_SORT_ORDER = [
  // Schema
  "$schema",
  // JSR package identity (when publishing to JSR via deno.json)
  "name",
  "version",
  "license",
  "exports",
  // Import maps
  "imports",
  "importMap",
  "scopes",
  // Tasks
  "tasks",
  // Compiler/runtime
  "compilerOptions",
  "nodeModulesDir",
  "vendor",
  "lock",
  // Tooling
  "lint",
  "fmt",
  "test",
  "bench",
  // Publishing
  "publish",
  // Workspace
  "workspace",
  "workspaces",
  // Unstable
  "unstable",
];

// =============================================================================
// Functions (exported for testing)
// =============================================================================

/** Determines sort order based on filename. Returns undefined for package.json (uses default). */
export function getSortOrder(filePath: string): string[] | undefined {
  const fileName = filePath.split("/").pop() ?? "";

  if (fileName === "jsr.json") {
    return JSR_SORT_ORDER;
  }
  if (fileName === "deno.json") {
    return DENO_SORT_ORDER;
  }
  // package.json and others use default sort-package-json order
  return undefined;
}

/** Extracts filename from a path. */
export function getFileName(filePath: string): string {
  return filePath.split("/").pop() ?? "";
}

// =============================================================================
// Main
// =============================================================================

if (import.meta.main) {
  const input = await new Response(Deno.stdin.readable).text();
  const filePath = Deno.args[0] ?? "";
  const sortOrder = getSortOrder(filePath);
  const options = sortOrder ? { sortOrder } : undefined;
  const sorted = sortPackageJson(input, options);

  console.log(sorted);
}

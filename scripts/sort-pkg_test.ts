import { assertEquals } from "@std/assert";
import {
  DENO_SORT_ORDER,
  getFileName,
  getSortOrder,
  JSR_SORT_ORDER,
} from "./sort-pkg.ts";

// =============================================================================
// JSR_SORT_ORDER tests
// =============================================================================

Deno.test("JSR_SORT_ORDER starts with $schema", () => {
  assertEquals(JSR_SORT_ORDER[0], "$schema");
});

Deno.test("JSR_SORT_ORDER contains expected fields", () => {
  const expected = [
    "$schema",
    "name",
    "version",
    "license",
    "exports",
    "publish",
  ];
  for (const field of expected) {
    assertEquals(
      JSR_SORT_ORDER.includes(field),
      true,
      `should include ${field}`,
    );
  }
});

Deno.test("JSR_SORT_ORDER has name before version", () => {
  const nameIdx = JSR_SORT_ORDER.indexOf("name");
  const versionIdx = JSR_SORT_ORDER.indexOf("version");
  assertEquals(nameIdx < versionIdx, true);
});

// =============================================================================
// DENO_SORT_ORDER tests
// =============================================================================

Deno.test("DENO_SORT_ORDER starts with $schema", () => {
  assertEquals(DENO_SORT_ORDER[0], "$schema");
});

Deno.test("DENO_SORT_ORDER contains expected fields", () => {
  const expected = [
    "$schema",
    "name",
    "version",
    "imports",
    "tasks",
    "compilerOptions",
    "lint",
    "fmt",
    "publish",
  ];
  for (const field of expected) {
    assertEquals(
      DENO_SORT_ORDER.includes(field),
      true,
      `should include ${field}`,
    );
  }
});

Deno.test("DENO_SORT_ORDER has imports before tasks", () => {
  const importsIdx = DENO_SORT_ORDER.indexOf("imports");
  const tasksIdx = DENO_SORT_ORDER.indexOf("tasks");
  assertEquals(importsIdx < tasksIdx, true);
});

Deno.test("DENO_SORT_ORDER has name before imports", () => {
  const nameIdx = DENO_SORT_ORDER.indexOf("name");
  const importsIdx = DENO_SORT_ORDER.indexOf("imports");
  assertEquals(nameIdx < importsIdx, true);
});

// =============================================================================
// getFileName tests
// =============================================================================

Deno.test("getFileName extracts filename from path", () => {
  assertEquals(getFileName("ts/jsr.json"), "jsr.json");
  assertEquals(getFileName("package.json"), "package.json");
  assertEquals(getFileName("/absolute/path/to/deno.json"), "deno.json");
});

Deno.test("getFileName handles empty string", () => {
  assertEquals(getFileName(""), "");
});

Deno.test("getFileName handles filename only", () => {
  assertEquals(getFileName("package.json"), "package.json");
});

// =============================================================================
// getSortOrder tests
// =============================================================================

Deno.test("getSortOrder returns JSR_SORT_ORDER for jsr.json", () => {
  assertEquals(getSortOrder("jsr.json"), JSR_SORT_ORDER);
  assertEquals(getSortOrder("ts/jsr.json"), JSR_SORT_ORDER);
  assertEquals(getSortOrder("/path/to/jsr.json"), JSR_SORT_ORDER);
});

Deno.test("getSortOrder returns DENO_SORT_ORDER for deno.json", () => {
  assertEquals(getSortOrder("deno.json"), DENO_SORT_ORDER);
  assertEquals(getSortOrder("./deno.json"), DENO_SORT_ORDER);
  assertEquals(getSortOrder("/path/to/deno.json"), DENO_SORT_ORDER);
});

Deno.test("getSortOrder returns undefined for package.json (default order)", () => {
  assertEquals(getSortOrder("package.json"), undefined);
  assertEquals(getSortOrder("ts/package.json"), undefined);
  assertEquals(getSortOrder("/path/to/package.json"), undefined);
});

Deno.test("getSortOrder returns undefined for unknown files", () => {
  assertEquals(getSortOrder("tsconfig.json"), undefined);
  assertEquals(getSortOrder("config.json"), undefined);
  assertEquals(getSortOrder(""), undefined);
});

Deno.test("getSortOrder does not match deno.jsonc (no jsonc support)", () => {
  // deno.jsonc should NOT be sorted by this script
  assertEquals(getSortOrder("deno.jsonc"), undefined);
});

Deno.test("getSortOrder is case-sensitive", () => {
  assertEquals(getSortOrder("JSR.JSON"), undefined);
  assertEquals(getSortOrder("DENO.JSON"), undefined);
  assertEquals(getSortOrder("Package.json"), undefined);
});

// =============================================================================
// Integration tests
// =============================================================================

Deno.test("sort order arrays have no duplicates", () => {
  const jsrSet = new Set(JSR_SORT_ORDER);
  assertEquals(
    jsrSet.size,
    JSR_SORT_ORDER.length,
    "JSR_SORT_ORDER has duplicates",
  );

  const denoSet = new Set(DENO_SORT_ORDER);
  assertEquals(
    denoSet.size,
    DENO_SORT_ORDER.length,
    "DENO_SORT_ORDER has duplicates",
  );
});

Deno.test("sort order arrays contain only strings", () => {
  for (const field of JSR_SORT_ORDER) {
    assertEquals(typeof field, "string");
  }
  for (const field of DENO_SORT_ORDER) {
    assertEquals(typeof field, "string");
  }
});

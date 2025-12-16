import { assertEquals } from "@std/assert";
import {
  generateNpmSummaryMarkdown,
  getNpmPackageUrl,
  NPM_BASE_URL,
  NPM_PACKAGE,
  NPM_REGISTRY,
  type PublishResult,
} from "./publish_npm_lib.ts";

// =============================================================================
// Constants tests
// =============================================================================

Deno.test("NPM_PACKAGE is correct", () => {
  assertEquals(NPM_PACKAGE, "@kjanat/dprint-zig");
});

Deno.test("NPM_BASE_URL is correct", () => {
  assertEquals(NPM_BASE_URL, "https://www.npmjs.com/package");
});

Deno.test("NPM_REGISTRY is correct", () => {
  assertEquals(NPM_REGISTRY, "https://registry.npmjs.org");
});

// =============================================================================
// getNpmPackageUrl tests
// =============================================================================

Deno.test("getNpmPackageUrl returns versioned URL", () => {
  assertEquals(
    getNpmPackageUrl("1.0.0"),
    "https://www.npmjs.com/package/@kjanat/dprint-zig/v/1.0.0",
  );
});

Deno.test("getNpmPackageUrl returns base URL without version", () => {
  assertEquals(
    getNpmPackageUrl(),
    "https://www.npmjs.com/package/@kjanat/dprint-zig",
  );
  assertEquals(
    getNpmPackageUrl(undefined),
    "https://www.npmjs.com/package/@kjanat/dprint-zig",
  );
});

// =============================================================================
// generateNpmSummaryMarkdown tests
// =============================================================================

Deno.test("generateNpmSummaryMarkdown for alreadyExists includes link", () => {
  const result: PublishResult = { published: false, alreadyExists: true };
  const md = generateNpmSummaryMarkdown("1.0.0", result, false);
  assertEquals(
    md,
    "\n:warning: Version [`1.0.0`](https://www.npmjs.com/package/@kjanat/dprint-zig/v/1.0.0) already exists on NPM\n",
  );
});

Deno.test("generateNpmSummaryMarkdown for successful publish includes link", () => {
  const result: PublishResult = { published: true, alreadyExists: false };
  const md = generateNpmSummaryMarkdown("2.0.0", result, false);
  assertEquals(
    md,
    "\n:white_check_mark: Published [`2.0.0`](https://www.npmjs.com/package/@kjanat/dprint-zig/v/2.0.0) to NPM\n",
  );
});

Deno.test("generateNpmSummaryMarkdown for failed publish (no link)", () => {
  const result: PublishResult = { published: false, alreadyExists: false };
  const md = generateNpmSummaryMarkdown("3.0.0", result, true);
  assertEquals(md, "\n:x: Failed to publish `3.0.0` to NPM\n");
});

Deno.test("generateNpmSummaryMarkdown for unknown state (no link)", () => {
  const result: PublishResult = { published: false, alreadyExists: false };
  const md = generateNpmSummaryMarkdown("4.0.0", result, false);
  assertEquals(md, "\n:question: Unknown state for `4.0.0`\n");
});

Deno.test("generateNpmSummaryMarkdown includes version in backticks", () => {
  const result: PublishResult = { published: true, alreadyExists: false };
  const md = generateNpmSummaryMarkdown("1.2.3", result, false);
  assertEquals(md.includes("`1.2.3`"), true);
});

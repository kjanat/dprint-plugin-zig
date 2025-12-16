import { assertEquals } from "@std/assert";
import {
  type CmdResult,
  detectAlreadyExists,
  determinePublishResult,
  generateJsrSummaryMarkdown,
  getJsrPackageUrl,
  JSR_BASE_URL,
  JSR_PACKAGE,
  type PublishResult,
  updateJsrJsonContent,
} from "./publish_jsr_lib.ts";

// =============================================================================
// Constants tests
// =============================================================================

Deno.test("JSR_PACKAGE is correct", () => {
  assertEquals(JSR_PACKAGE, "@kjanat/dprint-zig");
});

Deno.test("JSR_BASE_URL is correct", () => {
  assertEquals(JSR_BASE_URL, "https://jsr.io");
});

// =============================================================================
// getJsrPackageUrl tests
// =============================================================================

Deno.test("getJsrPackageUrl returns versioned URL", () => {
  assertEquals(
    getJsrPackageUrl("1.0.0"),
    "https://jsr.io/@kjanat/dprint-zig@1.0.0",
  );
});

Deno.test("getJsrPackageUrl returns base URL without version", () => {
  assertEquals(getJsrPackageUrl(), "https://jsr.io/@kjanat/dprint-zig");
  assertEquals(
    getJsrPackageUrl(undefined),
    "https://jsr.io/@kjanat/dprint-zig",
  );
});

// =============================================================================
// updateJsrJsonContent tests
// =============================================================================

Deno.test("updateJsrJsonContent sets version in JSON", () => {
  const input = JSON.stringify(
    { name: "@kjanat/dprint-zig", version: "0.0.0" },
    null,
    2,
  );
  const result = updateJsrJsonContent(input, "1.2.3");
  const parsed = JSON.parse(result);
  assertEquals(parsed.version, "1.2.3");
});

Deno.test("updateJsrJsonContent preserves other fields", () => {
  const input = JSON.stringify(
    {
      name: "@kjanat/dprint-zig",
      version: "0.0.0",
      exports: "./mod.ts",
    },
    null,
    2,
  );
  const result = updateJsrJsonContent(input, "2.0.0");
  const parsed = JSON.parse(result);
  assertEquals(parsed.name, "@kjanat/dprint-zig");
  assertEquals(parsed.exports, "./mod.ts");
  assertEquals(parsed.version, "2.0.0");
});

Deno.test("updateJsrJsonContent outputs formatted JSON with trailing newline", () => {
  const input = "{\"version\":\"0.0.0\"}";
  const result = updateJsrJsonContent(input, "1.0.0");
  assertEquals(result.endsWith("\n"), true);
  // Should be pretty-printed (contains newlines in body)
  assertEquals(result.includes("  "), true);
});

// =============================================================================
// detectAlreadyExists tests
// =============================================================================

Deno.test("detectAlreadyExists returns true when stdout contains 'already exists'", () => {
  assertEquals(
    detectAlreadyExists("error: Version 1.0.0 already exists on jsr.io", ""),
    true,
  );
});

Deno.test("detectAlreadyExists returns true when stderr contains 'already exists'", () => {
  assertEquals(
    detectAlreadyExists("", "Package version already exists"),
    true,
  );
});

Deno.test("detectAlreadyExists returns false when neither contains the phrase", () => {
  assertEquals(
    detectAlreadyExists("Publishing @kjanat/dprint-zig@1.0.0", ""),
    false,
  );
});

Deno.test("detectAlreadyExists is case-sensitive", () => {
  assertEquals(
    detectAlreadyExists("Already Exists", "ALREADY EXISTS"),
    false,
  );
});

// =============================================================================
// determinePublishResult tests
// =============================================================================

Deno.test("determinePublishResult returns alreadyExists when dry-run detects it", () => {
  const dryRun: CmdResult = {
    code: 1,
    stdout: "error: already exists",
    stderr: "",
  };
  const result = determinePublishResult(dryRun);
  assertEquals(result, { published: false, alreadyExists: true });
});

Deno.test("determinePublishResult returns published when publish succeeds", () => {
  const dryRun: CmdResult = { code: 0, stdout: "ok", stderr: "" };
  const publish: CmdResult = { code: 0, stdout: "Published!", stderr: "" };
  const result = determinePublishResult(dryRun, publish);
  assertEquals(result, { published: true, alreadyExists: false });
});

Deno.test("determinePublishResult returns failed when publish fails", () => {
  const dryRun: CmdResult = { code: 0, stdout: "ok", stderr: "" };
  const publish: CmdResult = { code: 1, stdout: "", stderr: "error" };
  const result = determinePublishResult(dryRun, publish);
  assertEquals(result, { published: false, alreadyExists: false });
});

Deno.test("determinePublishResult returns failed when no publish result provided", () => {
  const dryRun: CmdResult = { code: 0, stdout: "ok", stderr: "" };
  const result = determinePublishResult(dryRun);
  assertEquals(result, { published: false, alreadyExists: false });
});

// =============================================================================
// generateJsrSummaryMarkdown tests
// =============================================================================

Deno.test("generateJsrSummaryMarkdown for alreadyExists includes link", () => {
  const result: PublishResult = { published: false, alreadyExists: true };
  const md = generateJsrSummaryMarkdown("1.0.0", result, false);
  assertEquals(
    md,
    "\n:warning: Version [`1.0.0`](https://jsr.io/@kjanat/dprint-zig@1.0.0) already exists on JSR\n",
  );
});

Deno.test("generateJsrSummaryMarkdown for successful publish includes link", () => {
  const result: PublishResult = { published: true, alreadyExists: false };
  const md = generateJsrSummaryMarkdown("2.0.0", result, false);
  assertEquals(
    md,
    "\n:white_check_mark: Published [`2.0.0`](https://jsr.io/@kjanat/dprint-zig@2.0.0) to JSR\n",
  );
});

Deno.test("generateJsrSummaryMarkdown for failed publish (no link)", () => {
  const result: PublishResult = { published: false, alreadyExists: false };
  const md = generateJsrSummaryMarkdown("3.0.0", result, true);
  assertEquals(md, "\n:x: Failed to publish `3.0.0` to JSR\n");
});

Deno.test("generateJsrSummaryMarkdown for unknown state (no link)", () => {
  const result: PublishResult = { published: false, alreadyExists: false };
  const md = generateJsrSummaryMarkdown("4.0.0", result, false);
  assertEquals(md, "\n:question: Unknown state for `4.0.0`\n");
});

Deno.test("generateJsrSummaryMarkdown includes version in backticks", () => {
  const result: PublishResult = { published: true, alreadyExists: false };
  const md = generateJsrSummaryMarkdown("1.2.3", result, false);
  assertEquals(md.includes("`1.2.3`"), true);
});

// =============================================================================
// Integration-style tests (pure logic only)
// =============================================================================

Deno.test("full flow: already exists scenario", () => {
  const dryRun: CmdResult = {
    code: 1,
    stdout: "",
    stderr: "error: @kjanat/dprint-zig@1.0.0 already exists",
  };

  const result = determinePublishResult(dryRun);
  assertEquals(result.alreadyExists, true);
  assertEquals(result.published, false);

  const md = generateJsrSummaryMarkdown("1.0.0", result, false);
  assertEquals(md.includes(":warning:"), true);
});

Deno.test("full flow: successful publish scenario", () => {
  const dryRun: CmdResult = { code: 0, stdout: "Checking...", stderr: "" };
  const publish: CmdResult = {
    code: 0,
    stdout: "Published @kjanat/dprint-zig@2.0.0",
    stderr: "",
  };

  const result = determinePublishResult(dryRun, publish);
  assertEquals(result.published, true);
  assertEquals(result.alreadyExists, false);

  const md = generateJsrSummaryMarkdown("2.0.0", result, false);
  assertEquals(md.includes(":white_check_mark:"), true);
});

Deno.test("full flow: failed publish scenario", () => {
  const dryRun: CmdResult = { code: 0, stdout: "Checking...", stderr: "" };
  const publish: CmdResult = {
    code: 1,
    stdout: "",
    stderr: "Authentication failed",
  };

  const result = determinePublishResult(dryRun, publish);
  assertEquals(result.published, false);
  assertEquals(result.alreadyExists, false);

  const md = generateJsrSummaryMarkdown("3.0.0", result, true);
  assertEquals(md.includes(":x:"), true);
});

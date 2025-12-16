import { assertEquals, assertThrows } from "@std/assert";
import {
  getReadmeVersion,
  isValidVersion,
  isVersionNewer,
  README_URL_PATTERN,
  readZonVersion,
  updateReadmeVersion,
  updateZonVersion,
  VERSION_RE,
  ZON_VERSION_RE,
} from "./bump-version.ts";

// =============================================================================
// Test fixtures
// =============================================================================

const SAMPLE_ZON = `.{
    .name = .dprint_plugin_zig,
    .version = "1.2.3",
    .fingerprint = 0xe08d37d8804049ec,
}`;

const SAMPLE_README = `# Plugin

Install:
\`\`\`json
{
  "plugins": [
    "https://plugins.dprint.dev/kjanat/zig-1.2.3.wasm"
  ]
}
\`\`\`
`;

// =============================================================================
// VERSION_RE tests
// =============================================================================

Deno.test("VERSION_RE matches valid semver", () => {
  const valid = ["0.0.0", "1.2.3", "10.20.30", "999.999.999"];
  for (const v of valid) {
    assertEquals(VERSION_RE.test(v), true, `should match ${v}`);
  }
});

Deno.test("VERSION_RE rejects invalid versions", () => {
  const invalid = [
    "1.2",
    "1.2.3.4",
    "v1.2.3",
    "1.2.3-beta",
    "1.2.3+build",
    "abc.def.ghi",
    "1.2.x",
    "",
    "1",
    "1.2.",
    ".1.2.3",
  ];
  for (const v of invalid) {
    assertEquals(VERSION_RE.test(v), false, `should reject ${v}`);
  }
});

// =============================================================================
// isValidVersion tests
// =============================================================================

Deno.test("isValidVersion returns true for valid versions", () => {
  assertEquals(isValidVersion("0.0.0"), true);
  assertEquals(isValidVersion("1.2.3"), true);
  assertEquals(isValidVersion("10.20.30"), true);
});

Deno.test("isValidVersion returns false for invalid versions", () => {
  assertEquals(isValidVersion("1.2"), false);
  assertEquals(isValidVersion("v1.2.3"), false);
  assertEquals(isValidVersion("1.2.3-beta"), false);
});

// =============================================================================
// ZON_VERSION_RE tests
// =============================================================================

Deno.test("ZON_VERSION_RE extracts version from .zon content", () => {
  const match = SAMPLE_ZON.match(ZON_VERSION_RE);
  assertEquals(match?.[1], "1.2.3");
});

Deno.test("ZON_VERSION_RE handles various spacing", () => {
  const variants = [
    ".version = \"1.2.3\"",
    ".version  =  \"1.2.3\"",
    ".version= \"1.2.3\"",
    ".version =\"1.2.3\"",
  ];
  for (const v of variants) {
    const match = v.match(ZON_VERSION_RE);
    assertEquals(match?.[1], "1.2.3", `should extract from: ${v}`);
  }
});

// =============================================================================
// readZonVersion tests
// =============================================================================

Deno.test("readZonVersion extracts version", () => {
  assertEquals(readZonVersion(SAMPLE_ZON), "1.2.3");
});

Deno.test("readZonVersion throws on missing version", () => {
  assertThrows(
    () => readZonVersion(".{ .name = .foo }"),
    Error,
    "Could not parse version",
  );
});

// =============================================================================
// updateZonVersion tests
// =============================================================================

Deno.test("updateZonVersion replaces version", () => {
  const updated = updateZonVersion(SAMPLE_ZON, "2.0.0");
  assertEquals(readZonVersion(updated), "2.0.0");
  // Ensure rest of content preserved
  assertEquals(updated.includes(".name = .dprint_plugin_zig"), true);
  assertEquals(updated.includes(".fingerprint"), true);
});

Deno.test("updateZonVersion preserves structure", () => {
  const original = ".version = \"0.0.1\",\n    .other = \"value\"";
  const updated = updateZonVersion(original, "1.0.0");
  assertEquals(updated, ".version = \"1.0.0\",\n    .other = \"value\"");
});

// =============================================================================
// README_URL_PATTERN tests
// =============================================================================

Deno.test("README_URL_PATTERN matches expected format", () => {
  assertEquals(
    README_URL_PATTERN,
    "https://plugins.dprint.dev/kjanat/zig-",
  );
});

// =============================================================================
// getReadmeVersion tests
// =============================================================================

Deno.test("getReadmeVersion extracts version from README", () => {
  assertEquals(getReadmeVersion(SAMPLE_README), "1.2.3");
});

Deno.test("getReadmeVersion returns null if pattern not found", () => {
  assertEquals(getReadmeVersion("# No plugin URL here"), null);
});

Deno.test("getReadmeVersion returns null if .wasm suffix missing", () => {
  const broken = "https://plugins.dprint.dev/kjanat/zig-1.2.3";
  assertEquals(getReadmeVersion(broken), null);
});

// =============================================================================
// updateReadmeVersion tests
// =============================================================================

Deno.test("updateReadmeVersion replaces version", () => {
  const updated = updateReadmeVersion(SAMPLE_README, "2.0.0");
  assertEquals(getReadmeVersion(updated), "2.0.0");
  // Ensure rest preserved
  assertEquals(updated.includes("# Plugin"), true);
  assertEquals(updated.includes(".wasm"), true);
});

Deno.test("updateReadmeVersion throws if pattern not found", () => {
  assertThrows(
    () => updateReadmeVersion("# No URL", "1.0.0"),
    Error,
    "Could not find plugin URL",
  );
});

Deno.test("updateReadmeVersion throws if .wasm suffix missing", () => {
  const broken = "text https://plugins.dprint.dev/kjanat/zig-1.2.3 text";
  assertThrows(
    () => updateReadmeVersion(broken, "2.0.0"),
    Error,
    "Could not find .wasm suffix",
  );
});

// =============================================================================
// isVersionNewer tests
// =============================================================================

Deno.test("isVersionNewer returns true for newer versions", () => {
  assertEquals(isVersionNewer("1.0.0", "0.9.9"), true);
  assertEquals(isVersionNewer("1.0.1", "1.0.0"), true);
  assertEquals(isVersionNewer("1.1.0", "1.0.9"), true);
  assertEquals(isVersionNewer("2.0.0", "1.9.9"), true);
});

Deno.test("isVersionNewer returns false for older versions", () => {
  assertEquals(isVersionNewer("0.9.9", "1.0.0"), false);
  assertEquals(isVersionNewer("1.0.0", "1.0.1"), false);
  assertEquals(isVersionNewer("1.0.9", "1.1.0"), false);
});

Deno.test("isVersionNewer returns false for equal versions", () => {
  assertEquals(isVersionNewer("1.0.0", "1.0.0"), false);
  assertEquals(isVersionNewer("0.0.0", "0.0.0"), false);
});

// =============================================================================
// Integration-style tests
// =============================================================================

Deno.test("full workflow: update both files", () => {
  const zonContent = SAMPLE_ZON;
  const readmeContent = SAMPLE_README;
  const newVersion = "3.0.0";

  // Verify starting state
  assertEquals(readZonVersion(zonContent), "1.2.3");
  assertEquals(getReadmeVersion(readmeContent), "1.2.3");

  // Update both
  const newZon = updateZonVersion(zonContent, newVersion);
  const newReadme = updateReadmeVersion(readmeContent, newVersion);

  // Verify end state
  assertEquals(readZonVersion(newZon), "3.0.0");
  assertEquals(getReadmeVersion(newReadme), "3.0.0");
});

Deno.test("version comparison chain", () => {
  const versions = ["0.0.1", "0.0.2", "0.1.0", "0.1.1", "1.0.0", "1.0.1"];
  for (let i = 1; i < versions.length; i++) {
    assertEquals(
      isVersionNewer(versions[i], versions[i - 1]),
      true,
      `${versions[i]} should be newer than ${versions[i - 1]}`,
    );
    assertEquals(
      isVersionNewer(versions[i - 1], versions[i]),
      false,
      `${versions[i - 1]} should not be newer than ${versions[i]}`,
    );
  }
});

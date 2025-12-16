/**
 * @module
 * Pure/testable functions for JSR publishing logic.
 *
 * Separated from publish_jsr.ts to avoid importing @actions/* packages
 * during testing, which require GitHub Actions runtime environment.
 */

import type { CmdResult, PublishResult } from "./publish_lib.ts";

// Re-export shared types for convenience
export type { CmdResult, PublishResult } from "./publish_lib.ts";

// =============================================================================
// Constants
// =============================================================================

/** JSR package scope and name. */
export const JSR_PACKAGE = "@kjanat/dprint-zig";

/** Base URL for JSR package pages. */
export const JSR_BASE_URL = "https://jsr.io";

// =============================================================================
// Pure Functions
// =============================================================================

/** Generate JSR package URL for a specific version. */
export function getJsrPackageUrl(version?: string): string {
  const base = `${JSR_BASE_URL}/${JSR_PACKAGE}`;
  return version ? `${base}@${version}` : base;
}

/**
 * Parse JSR JSON and return updated content with new version.
 */
export function updateJsrJsonContent(content: string, version: string): string {
  const json = JSON.parse(content) as Record<string, unknown>;
  json.version = version;
  return JSON.stringify(json, null, 2) + "\n";
}

/**
 * Check if command output indicates version already exists on JSR.
 */
export function detectAlreadyExists(stdout: string, stderr: string): boolean {
  const combined = `${stdout}\n${stderr}`;
  return combined.includes("already exists");
}

/**
 * Determine publish result from dry-run and publish command results.
 */
export function determinePublishResult(
  dryRun: CmdResult,
  publish?: CmdResult,
): PublishResult {
  if (detectAlreadyExists(dryRun.stdout, dryRun.stderr)) {
    return { published: false, alreadyExists: true };
  }
  if (publish && publish.code === 0) {
    return { published: true, alreadyExists: false };
  }
  return { published: false, alreadyExists: false };
}

/**
 * Generate step summary markdown for JSR publish result.
 * Includes leading newline for proper HTML/markdown separation.
 */
export function generateJsrSummaryMarkdown(
  version: string,
  result: PublishResult,
  failed: boolean,
): string {
  const versionUrl = getJsrPackageUrl(version);
  if (result.alreadyExists) {
    return `\n:warning: Version [\`${version}\`](${versionUrl}) already exists on JSR\n`;
  }
  if (result.published) {
    return `\n:white_check_mark: Published [\`${version}\`](${versionUrl}) to JSR\n`;
  }
  if (failed) {
    return `\n:x: Failed to publish \`${version}\` to JSR\n`;
  }
  return `\n:question: Unknown state for \`${version}\`\n`;
}

// Keep old name as alias for backwards compatibility
export const generateSummaryMarkdown = generateJsrSummaryMarkdown;

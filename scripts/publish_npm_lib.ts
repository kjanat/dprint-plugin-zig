/**
 * @module
 * Pure/testable functions for npm publishing logic.
 *
 * Separated from publish_npm.ts to avoid importing @actions/* packages
 * during testing, which require GitHub Actions runtime environment.
 */

import type { PublishResult } from "./publish_lib.ts";

// Re-export shared types for convenience
export type { CmdResult, PublishResult } from "./publish_lib.ts";

// =============================================================================
// Constants
// =============================================================================

/** npm package scope and name. */
export const NPM_PACKAGE = "@kjanat/dprint-zig";

/** Base URL for npm package pages. */
export const NPM_BASE_URL = "https://www.npmjs.com/package";

/** npm registry URL for API calls. */
export const NPM_REGISTRY = "https://registry.npmjs.org";

// =============================================================================
// Pure Functions
// =============================================================================

/** Generate npm package URL for a specific version. */
export function getNpmPackageUrl(version?: string): string {
  const base = `${NPM_BASE_URL}/${NPM_PACKAGE}`;
  return version ? `${base}/v/${version}` : base;
}

/**
 * Check if a version already exists on npm registry.
 * Uses fetch to query the npm registry API.
 */
export async function checkNpmVersionExists(version: string): Promise<boolean> {
  const url = `${NPM_REGISTRY}/${NPM_PACKAGE}/${version}`;
  try {
    const res = await fetch(url);
    return res.status === 200;
  } catch {
    // Network error - assume not exists, let publish fail if it does
    return false;
  }
}

/**
 * Generate step summary markdown for npm publish result.
 * Includes leading newline for proper HTML/markdown separation.
 */
export function generateNpmSummaryMarkdown(
  version: string,
  result: PublishResult,
  failed: boolean,
): string {
  const versionUrl = getNpmPackageUrl(version);
  if (result.alreadyExists) {
    return `\n:warning: Version [\`${version}\`](${versionUrl}) already exists on NPM\n`;
  }
  if (result.published) {
    return `\n:white_check_mark: Published [\`${version}\`](${versionUrl}) to NPM\n`;
  }
  if (failed) {
    return `\n:x: Failed to publish \`${version}\` to NPM\n`;
  }
  return `\n:question: Unknown state for \`${version}\`\n`;
}

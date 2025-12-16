#!/usr/bin/env -S deno run -A
/**
 * @module
 * Publishes dprint-plugin-zig to npm from GitHub Actions.
 *
 * Downloads the "plugin" artifact, copies README.md and LICENSE,
 * sets package version, and publishes to npm with "already exists" detection.
 * Outputs GitHub Actions annotations and step summary.
 *
 * @example Usage (in GitHub Actions)
 * ```yaml
 * - name: Publish to NPM
 *   run: deno run -A scripts/publish_npm.ts
 *   env:
 *     NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
 * ```
 */

import * as core from "@actions/core";
import { resolve } from "node:path";

import {
  copyFiles,
  downloadArtifact,
  getVersionFromEnv,
  runCmd,
} from "./publish_lib.ts";
import {
  checkNpmVersionExists,
  generateNpmSummaryMarkdown,
} from "./publish_npm_lib.ts";

// =============================================================================
// NPM-Specific Functions
// =============================================================================

async function setNpmVersion(version: string) {
  const cwd = resolve("ts");
  const result = await runCmd(
    ["npm", "version", version, "--no-git-tag-version"],
    { cwd },
  );

  if (result.code !== 0) {
    throw new Error(`npm version failed: ${result.stderr || result.stdout}`);
  }

  core.info(`Set ts/package.json version to ${version}`);
}

async function npmPublishWithAlreadyExistsHandling(version: string) {
  const cwd = resolve("ts");

  // Check if version already exists
  const exists = await checkNpmVersionExists(version);

  if (exists) {
    core.warning(`Version ${version} already exists on NPM`);
    await core.summary
      .addHeading("NPM Publish", "2")
      .addRaw(
        generateNpmSummaryMarkdown(version, {
          published: false,
          alreadyExists: true,
        }, false),
      )
      .write();
    return { published: false, alreadyExists: true };
  }

  // Provenance only works in GitHub Actions (OIDC)
  const isCI = Deno.env.get("GITHUB_ACTIONS") === "true";
  const publishArgs = ["npm", "publish", "--access", "public"];
  if (isCI) publishArgs.push("--provenance");

  const pub = await runCmd(publishArgs, { cwd });

  if (pub.code === 0) {
    core.notice(`Published ${version} to NPM`);
    await core.summary
      .addHeading("NPM Publish", "2")
      .addRaw(
        generateNpmSummaryMarkdown(version, {
          published: true,
          alreadyExists: false,
        }, false),
      )
      .write();
    return { published: true, alreadyExists: false };
  }

  core.error(`Failed to publish ${version} to NPM`);
  await core.summary
    .addHeading("NPM Publish", "2")
    .addRaw(
      generateNpmSummaryMarkdown(version, {
        published: false,
        alreadyExists: false,
      }, true),
    )
    .write();

  core.setFailed(
    pub.stderr || pub.stdout || `npm publish failed (${pub.code})`,
  );
  return { published: false, alreadyExists: false };
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  try {
    const version = getVersionFromEnv();

    // Download artifact
    await downloadArtifact("plugin", "ts");

    // Copy README.md and LICENSE to ts/
    await copyFiles(["README.md", "LICENSE"], "ts");

    // Set version in package.json
    await setNpmVersion(version);

    // Publish
    await npmPublishWithAlreadyExistsHandling(version);
  } catch (err) {
    core.setFailed(err instanceof Error ? err.message : String(err));
  }
}

if (import.meta.main) {
  await main();
}

#!/usr/bin/env -S deno run -A
/**
 * @module
 * Publishes dprint-plugin-zig to JSR from GitHub Actions.
 *
 * Downloads the "plugin" artifact, updates ts/jsr.json version from
 * GITHUB_REF_NAME, and publishes to JSR with "already exists" detection.
 * Outputs GitHub Actions annotations and step summary.
 *
 * @example Usage (in GitHub Actions)
 * ```yaml
 * - name: Publish to JSR
 *   run: deno run -A scripts/publish_jsr.ts
 * ```
 */

import * as core from "@actions/core";
import { resolve } from "node:path";

import {
  detectAlreadyExists,
  generateJsrSummaryMarkdown,
  updateJsrJsonContent,
} from "./publish_jsr_lib.ts";
import { downloadArtifact, getVersionFromEnv, runCmd } from "./publish_lib.ts";

// =============================================================================
// JSR-Specific Functions
// =============================================================================

async function updateJsrVersion(version: string) {
  const filePath = resolve("ts", "jsr.json");
  const txt = await Deno.readTextFile(filePath);
  const updated = updateJsrJsonContent(txt, version);
  await Deno.writeTextFile(filePath, updated);
  core.info(`Set ts/jsr.json version to ${version}`);
}

async function denoPublishWithAlreadyExistsHandling(version: string) {
  const cwd = resolve("ts");

  const dry = await runCmd(
    ["deno", "publish", "--dry-run", "--allow-dirty"],
    { cwd },
  );

  if (detectAlreadyExists(dry.stdout, dry.stderr)) {
    core.warning(`Version ${version} already exists on JSR`);
    await core.summary
      .addHeading("JSR Publish", "2")
      .addRaw(
        generateJsrSummaryMarkdown(version, {
          published: false,
          alreadyExists: true,
        }, false),
      )
      .write();
    return { published: false, alreadyExists: true };
  }

  const pub = await runCmd(["deno", "publish", "--allow-dirty"], { cwd });

  if (pub.code === 0) {
    core.notice(`Published ${version} to JSR`);
    await core.summary
      .addHeading("JSR Publish", "2")
      .addRaw(
        generateJsrSummaryMarkdown(version, {
          published: true,
          alreadyExists: false,
        }, false),
      )
      .write();
    return { published: true, alreadyExists: false };
  }

  core.error(`Failed to publish ${version} to JSR`);
  await core.summary
    .addHeading("JSR Publish", "2")
    .addRaw(
      generateJsrSummaryMarkdown(version, {
        published: false,
        alreadyExists: false,
      }, true),
    )
    .write();

  core.setFailed(
    pub.stderr || pub.stdout || `deno publish failed (${pub.code})`,
  );
  return { published: false, alreadyExists: false };
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  try {
    const version = getVersionFromEnv();

    await downloadArtifact("plugin", "ts");
    await updateJsrVersion(version);
    await denoPublishWithAlreadyExistsHandling(version);
  } catch (err) {
    core.setFailed(err instanceof Error ? err.message : String(err));
  }
}

if (import.meta.main) {
  await main();
}

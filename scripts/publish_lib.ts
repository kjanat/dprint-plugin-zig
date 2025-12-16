/**
 * @module
 * Shared utilities for JSR and npm publishing scripts.
 *
 * Contains common types, command execution, artifact download,
 * and file copy utilities used by both publish_jsr.ts and publish_npm.ts.
 */

import { DefaultArtifactClient } from "@actions/artifact";
import * as core from "@actions/core";
import { resolve } from "node:path";

// =============================================================================
// Types
// =============================================================================

/** Result of running a shell command. */
export type CmdResult = { code: number; stdout: string; stderr: string };

/** Result of a publish attempt. */
export type PublishResult = {
  published: boolean;
  alreadyExists: boolean;
};

// =============================================================================
// Command Execution
// =============================================================================

/** Run a shell command and capture output. */
export async function runCmd(
  cmd: string[],
  opts: { cwd?: string } = {},
): Promise<CmdResult> {
  const { code, stdout, stderr } = await new Deno.Command(cmd[0], {
    args: cmd.slice(1),
    cwd: opts.cwd,
    stdout: "piped",
    stderr: "piped",
  }).output();

  return {
    code,
    stdout: new TextDecoder().decode(stdout),
    stderr: new TextDecoder().decode(stderr),
  };
}

// =============================================================================
// Artifact Download
// =============================================================================

/** Download a GitHub Actions artifact to a target directory. */
export async function downloadArtifact(
  artifactName: string,
  targetDir: string,
): Promise<string> {
  const workspace = Deno.env.get("GITHUB_WORKSPACE") ?? Deno.cwd();
  const fullTargetDir = resolve(workspace, targetDir);

  await Deno.mkdir(fullTargetDir, { recursive: true });

  const artifact = new DefaultArtifactClient();
  const { artifact: found } = await artifact.getArtifact(artifactName);

  if (!found) {
    throw new Error(`Artifact not found: ${artifactName}`);
  }

  const download = await artifact.downloadArtifact(found.id, {
    path: fullTargetDir,
  });

  const downloadPath = download.downloadPath ?? fullTargetDir;
  core.info(`Downloaded artifact '${artifactName}' to: ${downloadPath}`);
  return downloadPath;
}

// =============================================================================
// File Operations
// =============================================================================

/** Copy files from workspace root to target directory. */
export async function copyFiles(
  files: string[],
  targetDir: string,
): Promise<void> {
  const workspace = Deno.env.get("GITHUB_WORKSPACE") ?? Deno.cwd();
  const fullTargetDir = resolve(workspace, targetDir);

  await Deno.mkdir(fullTargetDir, { recursive: true });

  for (const file of files) {
    const src = resolve(workspace, file);
    const dest = resolve(fullTargetDir, file);
    await Deno.copyFile(src, dest);
    core.info(`Copied ${file} to ${targetDir}/`);
  }
}

// =============================================================================
// Version Utilities
// =============================================================================

/** Get version from GITHUB_REF_NAME environment variable. */
export function getVersionFromEnv(): string {
  const version = Deno.env.get("GITHUB_REF_NAME");
  if (!version) {
    throw new Error("GITHUB_REF_NAME is not set");
  }
  return version;
}

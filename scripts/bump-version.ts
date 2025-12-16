#!/usr/bin/env -S deno run --allow-read --allow-write --allow-run
/**
 * @module
 * Version bump and git tag creation script for dprint-plugin-zig.
 *
 * Validates semver format, ensures version is newer than current,
 * updates build.zig.zon and README.md, commits changes, and creates
 * a signed annotated git tag.
 *
 * @example Usage
 * ```sh
 * # Bump to specific version
 * deno run -A scripts/bump-version.ts 0.3.0 --title "Release title" --body "Description"
 *
 * # Use version from build.zig.zon
 * deno run -A scripts/bump-version.ts --title "Tag current" --body "Description"
 *
 * # Force overwrite existing tag
 * deno run -A scripts/bump-version.ts 0.3.0 -t "Title" -b "Body" --force
 * ```
 */

import { parseArgs } from "@std/cli";
import { greaterThan, parse as parseSemver } from "@std/semver";

// =============================================================================
// Constants & Types
// =============================================================================

/** Regex matching strict semver format (x.y.z). */
export const VERSION_RE = /^\d+\.\d+\.\d+$/;

/** Regex extracting version from build.zig.zon `.version = "x.y.z"` field. */
export const ZON_VERSION_RE = /\.version\s*=\s*"(\d+\.\d+\.\d+)"/;

/** URL pattern prefix for plugin in README.md. */
export const README_URL_PATTERN = "https://plugins.dprint.dev/kjanat/zig-";

// =============================================================================
// Helpers
// =============================================================================

async function run(
  cmd: string[],
  opts?: { check?: boolean },
): Promise<{ code: number; stdout: string; stderr: string }> {
  const proc = new Deno.Command(cmd[0], {
    args: cmd.slice(1),
    stdout: "piped",
    stderr: "piped",
  });
  const { code, stdout, stderr } = await proc.output();
  const result = {
    code,
    stdout: new TextDecoder().decode(stdout),
    stderr: new TextDecoder().decode(stderr),
  };
  if (opts?.check && code !== 0) {
    throw new Error(`Command failed: ${cmd.join(" ")}\n${result.stderr}`);
  }
  return result;
}

function die(msg: string, code = 1): never {
  console.error(`error: ${msg}`);
  Deno.exit(code);
}

function warn(msg: string): void {
  console.warn(`warning: ${msg}`);
}

// =============================================================================
// Version helpers (exported for testing)
// =============================================================================

/** Extracts version string from build.zig.zon content. */
export function readZonVersion(content: string): string {
  const match = content.match(ZON_VERSION_RE);
  if (!match) throw new Error("Could not parse version from build.zig.zon");
  return match[1];
}

/** Returns build.zig.zon content with version replaced. */
export function updateZonVersion(content: string, newVersion: string): string {
  return content.replace(ZON_VERSION_RE, `.version = "${newVersion}"`);
}

/** Returns README.md content with plugin URL version replaced. */
export function updateReadmeVersion(
  content: string,
  newVersion: string,
): string {
  const idx = content.indexOf(README_URL_PATTERN);
  if (idx === -1) throw new Error("Could not find plugin URL in README.md");

  const afterPattern = content.slice(idx + README_URL_PATTERN.length);
  const wasmIdx = afterPattern.indexOf(".wasm");
  if (wasmIdx === -1) throw new Error("Could not find .wasm suffix in README");

  return content.slice(0, idx + README_URL_PATTERN.length) + newVersion
    + afterPattern.slice(wasmIdx);
}

/** Extracts version from README.md plugin URL, or null if not found. */
export function getReadmeVersion(content: string): string | null {
  const idx = content.indexOf(README_URL_PATTERN);
  if (idx === -1) return null;

  const afterPattern = content.slice(idx + README_URL_PATTERN.length);
  const wasmIdx = afterPattern.indexOf(".wasm");
  if (wasmIdx === -1) return null;

  return afterPattern.slice(0, wasmIdx);
}

/** Returns true if target version is greater than current version. */
export function isVersionNewer(target: string, current: string): boolean {
  const targetSv = parseSemver(target);
  const currentSv = parseSemver(current);
  return greaterThan(targetSv, currentSv);
}

/** Returns true if version string matches x.y.z format. */
export function isValidVersion(version: string): boolean {
  return VERSION_RE.test(version);
}

// =============================================================================
// Git helpers
// =============================================================================

async function isWorkingTreeClean(): Promise<boolean> {
  const { stdout } = await run(["git", "status", "--porcelain"]);
  return stdout.trim() === "";
}

async function tagExists(tag: string): Promise<boolean> {
  const { stdout } = await run(["git", "tag", "-l", tag]);
  return stdout.trim() !== "";
}

async function createSignedTag(
  version: string,
  title: string,
  body: string,
  force: boolean,
): Promise<void> {
  const message = `${title}\n\n${body}`;
  const args = ["git", "tag", "-s"];
  if (force) args.push("-f");
  args.push(version, "-m", message);
  await run(args, { check: true });
}

async function commitChanges(version: string): Promise<void> {
  await run(["git", "add", "build.zig.zon", "README.md"], { check: true });
  await run(["git", "commit", "-m", `release: ${version}`], { check: true });
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  const args = parseArgs(Deno.args, {
    string: ["title", "body"],
    boolean: ["force", "help"],
    alias: { t: "title", b: "body", f: "force", h: "help" },
  });

  if (args.help) {
    console.log(
      `Usage: bump-version.ts [version] --title "Title" --body "Body" [--force]

Arguments:
  version     Target version (semver). If omitted, uses build.zig.zon version.

Options:
  -t, --title   Tag title (required)
  -b, --body    Tag description body (required)
  -f, --force   Force-create tag even if it exists
  -h, --help    Show this help`,
    );
    Deno.exit(0);
  }

  // Validate required args
  if (!args.title?.trim()) die("--title is required");
  if (!args.body?.trim()) die("--body is required");

  const title = args.title.trim();
  const body = args.body.trim();
  const force = args.force ?? false;
  const versionArg = args._[0]?.toString();

  // Read current state
  const zonPath = "build.zig.zon";
  const readmePath = "README.md";
  const zonContent = await Deno.readTextFile(zonPath);
  const readmeContent = await Deno.readTextFile(readmePath);
  const currentVersion = readZonVersion(zonContent);
  const readmeVersion = getReadmeVersion(readmeContent);

  // Determine target version
  let targetVersion: string;
  if (versionArg) {
    if (!isValidVersion(versionArg)) {
      die(`Invalid version format: ${versionArg} (expected x.y.z)`);
    }
    targetVersion = versionArg;

    // Validate version is newer (unless same as current)
    if (targetVersion !== currentVersion) {
      if (!isVersionNewer(targetVersion, currentVersion)) {
        die(`${targetVersion} is not greater than current ${currentVersion}`);
      }
    }
  } else {
    targetVersion = currentVersion;
  }

  // Check git state
  if (!await isWorkingTreeClean()) {
    die("Working tree is not clean. Commit or stash changes first.");
  }

  const tagAlreadyExists = await tagExists(targetVersion);
  if (tagAlreadyExists && !force) {
    die(`Tag ${targetVersion} already exists. Use --force to overwrite.`);
  }

  // Determine what needs updating
  const needsZonUpdate = targetVersion !== currentVersion;
  const needsReadmeUpdate = readmeVersion !== targetVersion;
  const needsTag = !tagAlreadyExists || force;

  if (!needsZonUpdate && !needsReadmeUpdate && !needsTag) {
    warn("Nothing to do: version already matches and tag exists.");
    Deno.exit(0);
  }

  // Apply updates
  let filesChanged = false;

  if (needsZonUpdate) {
    const newZon = updateZonVersion(zonContent, targetVersion);
    await Deno.writeTextFile(zonPath, newZon);
    console.log(`Updated ${zonPath}: ${currentVersion} -> ${targetVersion}`);
    filesChanged = true;
  }

  if (needsReadmeUpdate) {
    const newReadme = updateReadmeVersion(readmeContent, targetVersion);
    await Deno.writeTextFile(readmePath, newReadme);
    console.log(
      `Updated ${readmePath}: ${
        readmeVersion ?? "unknown"
      } -> ${targetVersion}`,
    );
    filesChanged = true;
  }

  // Commit if files changed
  if (filesChanged) {
    await commitChanges(targetVersion);
    console.log(`Committed: release: ${targetVersion}`);
  }

  // Create tag
  if (needsTag) {
    await createSignedTag(
      targetVersion,
      title,
      body,
      force && tagAlreadyExists,
    );
    console.log(
      `Created signed tag: ${targetVersion}${
        tagAlreadyExists ? " (forced)" : ""
      }`,
    );
  }

  console.log(
    `\nDone! Push with: git push && git push origin ${targetVersion}`,
  );
}

// Only run main when executed directly (not imported for tests)
if (import.meta.main) {
  main();
}

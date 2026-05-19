#!/usr/bin/env node

/**
 * Fail when a release-branch diff touches paths outside the release allowlist.
 * Skips (exit 0) on non-release branches. See `.ai/CI-TIERS.md` / release closeout.
 */

import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_RELEASE_ALLOWLIST_GLOBS = [
  "package.json",
  "CHANGELOG.md",
  "schemas/_generated-*",
  ".workspace-kit/**"
];

export function globToRegExp(glob) {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "{{GLOBSTAR}}")
    .replace(/\*/g, "[^/]*")
    .replace(/\{\{GLOBSTAR\}\}/g, ".*");
  return new RegExp(`^${escaped}$`);
}

export function compileAllowlistPatterns(globs) {
  return globs.map((glob) => globToRegExp(glob.trim())).filter(Boolean);
}

export function pathMatchesAllowlist(filePath, patterns) {
  return patterns.some((pattern) => pattern.test(filePath));
}

export function evaluateReleaseDiffShape(args) {
  const changedPaths = args.changedPaths.filter((p) => p.trim().length > 0);
  const patterns = compileAllowlistPatterns([
    ...DEFAULT_RELEASE_ALLOWLIST_GLOBS,
    ...(args.extraAllowlistGlobs ?? [])
  ]);
  const disallowed = changedPaths.filter((p) => !pathMatchesAllowlist(p, patterns));
  return {
    ok: disallowed.length === 0,
    disallowed,
    patterns: patterns.map((p) => p.source),
    changedCount: changedPaths.length
  };
}

export async function readProfileExtraAllowlist(workspacePath) {
  try {
    const raw = await readFile(resolve(workspacePath, "workspace-kit.profile.json"), "utf8");
    const profile = JSON.parse(raw);
    const extra = profile?.release?.allowlist;
    if (!Array.isArray(extra)) {
      return [];
    }
    return extra.filter((entry) => typeof entry === "string" && entry.trim().length > 0);
  } catch {
    return [];
  }
}

export function currentBranchName(workspacePath) {
  try {
    return execFileSync("git", ["-C", workspacePath, "rev-parse", "--abbrev-ref", "HEAD"], {
      encoding: "utf8"
    }).trim();
  } catch {
    return null;
  }
}

export function isReleaseBranchName(branch) {
  return typeof branch === "string" && (branch === "main" || branch.startsWith("release/"));
}

export function listChangedPaths(workspacePath, baseRef) {
  const base = baseRef.trim();
  try {
    const out = execFileSync("git", ["-C", workspacePath, "diff", "--name-only", `${base}..HEAD`], {
      encoding: "utf8"
    });
    return out
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  } catch (error) {
    return { error: (error).message ?? String(error) };
  }
}

export function resolveDiffBase(args) {
  if (typeof args.baseRef === "string" && args.baseRef.trim()) {
    return args.baseRef.trim();
  }
  if (typeof process.env.RELEASE_DIFF_BASE === "string" && process.env.RELEASE_DIFF_BASE.trim()) {
    return process.env.RELEASE_DIFF_BASE.trim();
  }
  if (isReleaseBranchName(args.branch)) {
    return "HEAD~1";
  }
  return "origin/main";
}

export function isZeroSha(ref) {
  return typeof ref === "string" && /^0+$/.test(ref.replace(/[^0-9a-f]/gi, ""));
}

async function main() {
  const workspacePath = process.cwd();
  const branch = currentBranchName(workspacePath);
  if (!isReleaseBranchName(branch)) {
    console.log(`check-release-diff-shape: skipped (branch ${branch ?? "unknown"} is not main or release/*)`);
    process.exit(0);
  }

  const baseRef = resolveDiffBase({ branch });
  if (isZeroSha(baseRef)) {
    console.log("check-release-diff-shape: skipped (no prior commit on branch create)");
    process.exit(0);
  }

  const changed = listChangedPaths(workspacePath, baseRef);
  if (changed.error) {
    console.error(`check-release-diff-shape: cannot diff ${baseRef}..HEAD: ${changed.error}`);
    process.exit(1);
  }

  const extraAllowlistGlobs = await readProfileExtraAllowlist(workspacePath);
  const result = evaluateReleaseDiffShape({ changedPaths: changed, extraAllowlistGlobs });

  if (!result.ok) {
    console.error("check-release-diff-shape FAILED: diff includes non-allowlisted paths:");
    for (const path of result.disallowed) {
      console.error(`  ${path}`);
    }
    console.error(`Base: ${baseRef}..HEAD (${result.changedCount} path(s) changed)`);
    console.error(`Default allowlist: ${DEFAULT_RELEASE_ALLOWLIST_GLOBS.join(", ")}`);
    if (extraAllowlistGlobs.length > 0) {
      console.error(`Profile extras: ${extraAllowlistGlobs.join(", ")}`);
    }
    process.exit(1);
  }

  console.log(
    `check-release-diff-shape passed (${result.changedCount} path(s) under release allowlist, base ${baseRef}..HEAD).`
  );
  process.exit(0);
}

const isMain =
  process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  main();
}

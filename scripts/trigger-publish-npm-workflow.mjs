#!/usr/bin/env node
/**
 * Dispatches `.github/workflows/publish-npm.yml` (workflow_dispatch) via GitHub CLI.
 * Uses repo `secrets.NPM_TOKEN` on the runner — not your local ~/.npmrc.
 *
 * Usage:
 *   pnpm run publish:npm
 *   pnpm run publish:npm -- next
 *   NPM_DIST_TAG=next pnpm run publish:npm
 *
 * Requires: `gh` on PATH and `gh auth login` with permission to dispatch workflows on this repo.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

/** npm dist-tags: conservative ASCII (see `npm dist-tag add`). */
const DIST_TAG_RE = /^[a-zA-Z0-9._-]+$/;

function readDefaultBranch() {
  try {
    const head = path.join(ROOT, ".git", "HEAD");
    if (!fs.existsSync(head)) {
      return "main";
    }
    const sym = execFileSync(
      "git",
      ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"],
      { cwd: ROOT, encoding: "utf8" }
    ).trim();
    return sym.replace(/^origin\//, "") || "main";
  } catch {
    return "main";
  }
}

function actionsWorkflowsUrl() {
  try {
    const raw = JSON.parse(
      fs.readFileSync(path.join(ROOT, "package.json"), "utf8")
    ).repository?.url;
    if (typeof raw !== "string") {
      return null;
    }
    const m = raw.match(/github\.com[:/]([^/]+\/[^/.]+)/i);
    return m ? `https://github.com/${m[1]}/actions/workflows/publish-npm.yml` : null;
  } catch {
    return null;
  }
}

function usage() {
  console.error(`Usage: pnpm run publish:npm -- [dist-tag]
       NPM_DIST_TAG=next pnpm run publish:npm

Dispatches the GitHub Actions workflow publish-npm.yml on the repo default branch
(uses secrets.NPM_TOKEN on GitHub — not local npm auth).

Default dist-tag: latest`);
}

const argv = process.argv.slice(2);
if (argv.includes("-h") || argv.includes("--help")) {
  usage();
  process.exit(0);
}

const positional = argv.filter((a) => !a.startsWith("-"));
const tag =
  (process.env.NPM_DIST_TAG && String(process.env.NPM_DIST_TAG).trim()) ||
  positional[0]?.trim() ||
  "latest";

if (!DIST_TAG_RE.test(tag)) {
  console.error(
    `Invalid npm dist-tag (use letters, digits, ., _, - only): ${JSON.stringify(tag)}`
  );
  process.exit(2);
}

const ref = readDefaultBranch();
const args = [
  "workflow",
  "run",
  "publish-npm.yml",
  "--ref",
  ref,
  "-f",
  `tag=${tag}`,
];

try {
  execFileSync("gh", args, { cwd: ROOT, stdio: "inherit" });
} catch {
  console.error(
    "\nTip: install GitHub CLI (gh) and run `gh auth login`. Repo needs Actions secret NPM_TOKEN."
  );
  process.exit(1);
}

const actionsUrl = actionsWorkflowsUrl();
if (actionsUrl) {
  console.error(`\nWorkflow dispatch sent. Watch runs: ${actionsUrl}`);
}

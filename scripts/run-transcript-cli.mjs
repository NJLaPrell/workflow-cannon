#!/usr/bin/env node

/**
 * Repo-local helper for transcript:* package scripts (T271).
 * Fails fast if dist/cli.js is missing; forwards to workspace-kit run <command> with "{}" args.
 */

import { access, constants } from "node:fs/promises";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLI = path.join(ROOT, "dist", "cli.js");

const ALLOWED = new Set(["sync-transcripts", "ingest-transcripts"]);

/** For ingest-transcripts only: merge WORKSPACE_KIT_POLICY_APPROVAL JSON into run args (run path ignores the env var). */
function jsonArgsFor(cmd) {
  if (cmd !== "ingest-transcripts") return "{}";
  const raw = process.env.WORKSPACE_KIT_POLICY_APPROVAL?.trim();
  if (!raw) return "{}";
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return JSON.stringify({ policyApproval: parsed });
    }
  } catch {
    // fall through
  }
  return "{}";
}

async function main() {
  const cmd = process.argv[2];
  if (!cmd || !ALLOWED.has(cmd)) {
    console.error(
      `Usage: node scripts/run-transcript-cli.mjs <sync-transcripts|ingest-transcripts>\n` +
        `ingest-transcripts needs JSON policyApproval on the run path; this script forwards WORKSPACE_KIT_POLICY_APPROVAL when set (see docs/maintainers/runbooks/cursor-transcript-automation.md).`
    );
    process.exit(2);
  }

  try {
    await access(CLI, constants.F_OK);
  } catch {
    console.error(
      `Missing ${CLI}. Run \`pnpm run build\` first so workspace-kit CLI is available.`
    );
    process.exit(1);
  }

  const jsonArgs = jsonArgsFor(cmd);
  await new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      [CLI, "run", cmd, jsonArgs],
      { cwd: ROOT, encoding: "utf8" },
      (err, stdout, stderr) => {
        if (stdout) process.stdout.write(stdout);
        if (stderr) process.stderr.write(stderr);
        if (err) reject(err);
        else resolve(undefined);
      }
    );
  });
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

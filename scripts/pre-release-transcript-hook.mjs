#!/usr/bin/env node

/**
 * Optional, non-blocking pre-release transcript hook.
 * Runs ingest-transcripts with WORKSPACE_KIT_POLICY_APPROVAL when set; otherwise sync-only summary.
 * Always exits 0 so release gates are advisory unless you wire stricter CI behavior.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { resolve } from "node:path";

const ROOT = process.cwd();
const ARTIFACTS = resolve(ROOT, "artifacts");
const OUT = resolve(ARTIFACTS, "pre-release-transcript-summary.json");

function runNode(args) {
  return new Promise((res, rej) => {
    execFile(process.execPath, args, { cwd: ROOT, encoding: "utf8" }, (err, stdout, stderr) => {
      if (err) {
        rej(Object.assign(err, { stdout, stderr }));
        return;
      }
      res({ stdout, stderr });
    });
  });
}

async function main() {
  await mkdir(ARTIFACTS, { recursive: true });
  const cli = resolve(ROOT, "dist/cli.js");
  const hasApproval = Boolean(process.env.WORKSPACE_KIT_POLICY_APPROVAL?.trim());

  const summary = {
    schemaVersion: 1,
    timestamp: new Date().toISOString(),
    mode: hasApproval ? "ingest-transcripts" : "sync-transcripts-only",
    ok: true,
    cliOutput: null,
    note: hasApproval
      ? "Ran ingest-transcripts with WORKSPACE_KIT_POLICY_APPROVAL."
      : "No WORKSPACE_KIT_POLICY_APPROVAL; ran sync-transcripts only. Set env to include recommendation generation."
  };

  try {
    if (hasApproval) {
      const { stdout } = await runNode([
        cli,
        "run",
        "ingest-transcripts",
        "{}"
      ]);
      summary.cliOutput = stdout.trim().slice(0, 50_000);
    } else {
      const { stdout } = await runNode([cli, "run", "sync-transcripts", "{}"]);
      summary.cliOutput = stdout.trim().slice(0, 50_000);
    }
  } catch (e) {
    summary.ok = false;
    summary.error = e instanceof Error ? e.message : String(e);
    if (e && typeof e === "object" && "stdout" in e) {
      summary.cliOutput = String(e.stdout ?? "").trim().slice(0, 50_000);
    }
  }

  await writeFile(OUT, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  console.log(`pre-release-transcript-hook: wrote ${OUT} (ok=${summary.ok})`);
}

main().catch((err) => {
  console.error(`pre-release-transcript-hook failed: ${err instanceof Error ? err.message : err}`);
  process.exit(0);
});

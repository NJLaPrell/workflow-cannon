#!/usr/bin/env node

/**
 * Optional, non-blocking pre-release transcript hook.
 * When WORKSPACE_KIT_POLICY_APPROVAL is set to valid JSON, forwards it as run JSON
 * `policyApproval` for ingest-transcripts (workspace-kit run does not read the env var itself).
 * Otherwise runs sync-transcripts only. Always exits 0 unless you wire stricter CI behavior.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { resolve } from "node:path";

const ROOT = process.cwd();
const ARTIFACTS = resolve(ROOT, "artifacts");
const OUT = resolve(ARTIFACTS, "pre-release-transcript-summary.json");

/** @returns {string | null} JSON third-arg for `workspace-kit run ingest-transcripts`, or null if env unset/invalid */
function ingestArgsFromEnvApproval() {
  const raw = process.env.WORKSPACE_KIT_POLICY_APPROVAL?.trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return JSON.stringify({ policyApproval: parsed });
    }
  } catch {
    // treat as absent
  }
  return null;
}

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
  const ingestJson = ingestArgsFromEnvApproval();
  const hasApproval = ingestJson != null;

  const summary = {
    schemaVersion: 1,
    timestamp: new Date().toISOString(),
    mode: hasApproval ? "ingest-transcripts" : "sync-transcripts-only",
    ok: true,
    cliOutput: null,
    note: hasApproval
      ? "Ran ingest-transcripts with policyApproval merged from WORKSPACE_KIT_POLICY_APPROVAL JSON (see POLICY-APPROVAL.md: run path still requires JSON approval; this hook bridges env → args)."
      : "No valid WORKSPACE_KIT_POLICY_APPROVAL JSON; ran sync-transcripts only. Set env to a JSON object like {\"confirmed\":true,\"rationale\":\"pre-release ingest\"} to run ingest."
  };

  try {
    if (hasApproval) {
      const { stdout } = await runNode([
        cli,
        "run",
        "ingest-transcripts",
        ingestJson
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

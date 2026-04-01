#!/usr/bin/env node
/**
 * Playbook step runner: executes explicit argv steps (workspace-kit lines only), logs stdout/stderr summaries.
 * Usage: node scripts/playbook-run-steps.mjs path/to/steps.json [--log artifacts/playbook-log.jsonl]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function main() {
  const specPath = path.resolve(process.argv[2] || "");
  if (!specPath || !fs.existsSync(specPath)) {
    console.error("Usage: node scripts/playbook-run-steps.mjs <steps.json> [--log log.jsonl]");
    process.exit(2);
  }
  const logIdx = process.argv.indexOf("--log");
  const logPath = logIdx >= 0 && process.argv[logIdx + 1] ? path.resolve(process.argv[logIdx + 1]) : null;
  const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));
  if (!Array.isArray(spec.steps)) {
    console.error("steps.json must contain { steps: [ { argv: string[], expectCode?: number } ] }");
    process.exit(2);
  }
  const entries = [];
  for (let i = 0; i < spec.steps.length; i++) {
    const step = spec.steps[i];
    const argv = step.argv;
    if (!Array.isArray(argv) || argv.some((a) => typeof a !== "string")) {
      console.error(`Step ${i}: argv must be string[]`);
      process.exit(2);
    }
    const expectCode = typeof step.expectCode === "number" ? step.expectCode : 0;
    const r = spawnSync(argv[0], argv.slice(1), {
      cwd: ROOT,
      encoding: "utf8",
      env: { ...process.env, NODE_OPTIONS: process.env.NODE_OPTIONS || "" }
    });
    const entry = {
      index: i,
      argv,
      status: r.status,
      stdoutTail: (r.stdout || "").slice(-4000),
      stderrTail: (r.stderr || "").slice(-4000)
    };
    entries.push(entry);
    if (logPath) {
      fs.mkdirSync(path.dirname(logPath), { recursive: true });
      fs.appendFileSync(logPath, JSON.stringify(entry) + "\n", "utf8");
    }
    if (r.status !== expectCode) {
      console.error(JSON.stringify({ ok: false, failedStep: entry }, null, 2));
      process.exit(1);
    }
  }
  console.log(JSON.stringify({ ok: true, stepsRun: entries.length }, null, 2));
}

main();

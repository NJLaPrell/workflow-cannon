#!/usr/bin/env node
/** Quick dashboard refresh benchmark — run from repo root. */
import { execFile } from "node:child_process";
import { performance } from "node:perf_hooks";

function runCli(args) {
  return new Promise((resolve, reject) => {
    const t0 = performance.now();
    execFile("node", ["dist/cli.js", "run", ...args], { maxBuffer: 64 * 1024 * 1024 }, (err, stdout) => {
      if (err) reject(err);
      else resolve({ ms: performance.now() - t0, json: JSON.parse(stdout) });
    });
  });
}

const total0 = performance.now();
const dash = await runCli(["dashboard-summary", "{}"]);
const parallel0 = performance.now();
await Promise.all([
  runCli(["list-phase-notes", "{}"]),
  runCli(["get-phase-context", "{}"]),
  runCli(["cae-dashboard-summary", '{"schemaVersion":1}'])
]);
const parallelMs = performance.now() - parallel0;
const past = dash.json?.data?.pastPhaseNotes;
console.log("\nDashboard refresh benchmark\n");
console.log(`  ${Math.round(dash.ms).toString().padStart(6)} ms  dashboard-summary (includes pastPhaseNotes)`);
console.log(`  ${Math.round(parallelMs).toString().padStart(6)} ms  extension journal + CAE parallel block`);
console.log(`  ${Math.round(performance.now() - total0).toString().padStart(6)} ms  TOTAL (no per-phase list-phase-notes)`);
console.log(`\n  pastPhaseNotes entries: ${Array.isArray(past) ? past.length : "n/a"}`);

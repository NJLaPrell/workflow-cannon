#!/usr/bin/env node
/**
 * Dashboard hydration benchmark (Phase 108 lazy-loading evidence).
 *
 * Measures CLI read paths separately:
 * - overview projection (first dashboard paint data path)
 * - queue projection (task-engine tab slice)
 * - full projection (manual refresh / legacy monolith)
 * - secondary tab block (phase journal + CAE — must NOT run on initial overview open)
 *
 * Run from repo root after `pnpm run build`.
 */
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

function padMs(ms) {
  return Math.round(ms).toString().padStart(6);
}

const total0 = performance.now();

const overview = await runCli(["dashboard-summary", '{"projection":"overview"}']);
const queue = await runCli([
  "dashboard-summary",
  '{"projection":"queue","wishlistPage":0,"wishlistPageSize":5}'
]);
const full = await runCli(["dashboard-summary", '{"projection":"full"}']);

const secondary0 = performance.now();
await Promise.all([
  runCli(["list-phase-notes", "{}"]),
  runCli(["get-phase-context", "{}"]),
  runCli(["cae-authoring-summary", '{"schemaVersion":1}'])
]);
const secondaryMs = performance.now() - secondary0;

const overviewProj = overview.json?.data?.dashboardProjection;
const queueProj = queue.json?.data?.dashboardProjection;

console.log("\nDashboard lazy-loading benchmark (CLI read paths)\n");
console.log("  Shell / tab chrome is synchronous in the extension (not measured here).");
console.log("");
console.log(`  ${padMs(overview.ms)} ms  dashboard-summary projection=overview (first hydration)`);
console.log(`  ${padMs(queue.ms)} ms  dashboard-summary projection=queue (task-engine slice)`);
console.log(`  ${padMs(full.ms)} ms  dashboard-summary projection=full (manual refresh path)`);
console.log(
  `  ${padMs(secondaryMs)} ms  secondary block: list-phase-notes + get-phase-context + cae-authoring-summary`
);
console.log(`  ${padMs(performance.now() - total0)} ms  TOTAL (sequential overview + queue + full + secondary)`);
console.log("");
console.log(`  overview dashboardProjection: ${overviewProj ?? "n/a"}`);
console.log(`  queue dashboardProjection: ${queueProj ?? "n/a"}`);
console.log(
  `  initial-open target: overview only (~${padMs(overview.ms)} ms); defer secondary (~${padMs(secondaryMs)} ms) until tab activation`
);
console.log("");
console.log("  Option 1 SLA gates (extension pollers — not measured here):");
console.log("    critical slices target ≤5000 ms freshness");
console.log("    visible non-heavy slices target ≤10000 ms freshness");
console.log("  Enable slice trace: WORKSPACE_KIT_DEBUG_DASHBOARD=1");

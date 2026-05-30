#!/usr/bin/env node
/**
 * Dashboard Option 2 read-service benchmark (Phase 122).
 *
 * Measures warm SQLite service paths (no extension):
 * - cold: create service + refresh overview + fetch snapshot
 * - warm: fetch snapshot again (in-memory store)
 * - health: observability payload after refresh
 *
 * Run from repo root after `pnpm run build`.
 *
 * SLA targets (Option 2 handoff):
 *   cold first snapshot  < 5000 ms
 *   warm snapshot        < 1000 ms
 *   critical poll tier   ≤ 2000 ms (service poll-groups)
 *   visible ops tier     ≤ 10000 ms
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { createDashboardService } from "../dist/services/dashboard-service/server.js";

async function tmpWorkspace() {
  return fs.mkdtemp(path.join(os.tmpdir(), "wk-dash-bench-"));
}

async function seedEmptySqlite(workspace) {
  const { SqliteDualPlanningStore } = await import("../dist/modules/task-engine/persistence/sqlite-dual-planning.js");
  const { TaskStore } = await import("../dist/modules/task-engine/persistence/store.js");
  await fs.mkdir(path.join(workspace, ".workspace-kit", "tasks"), { recursive: true });
  const dual = new SqliteDualPlanningStore(workspace, ".workspace-kit/tasks/workspace-kit.db");
  dual.loadFromDisk();
  const store = TaskStore.forSqliteDual(dual);
  await store.load();
  await store.save();
}

function padMs(ms) {
  return Math.round(ms).toString().padStart(6);
}

function gate(label, ms, limitMs) {
  const ok = ms <= limitMs;
  console.log(`  ${ok ? "✓" : "✗"} ${label}: ${padMs(ms)} ms (limit ${limitMs} ms)`);
  return ok;
}

const workspace = await tmpWorkspace();
await seedEmptySqlite(workspace);

const cold0 = performance.now();
const svc = await createDashboardService({ workspacePath: workspace });
const base = `http://${svc.host}:${svc.port}`;
await fetch(`${base}/dashboard/refresh`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ slices: ["overview"] })
});
const snapRes = await fetch(`${base}/dashboard/snapshot`);
await snapRes.json();
const coldMs = performance.now() - cold0;

const warm0 = performance.now();
await (await fetch(`${base}/dashboard/snapshot`)).json();
const warmMs = performance.now() - warm0;

const health = await (await fetch(`${base}/health`)).json();

await svc.stop();

console.log("\nDashboard Option 2 service benchmark\n");
console.log(`  ${padMs(coldMs)} ms  cold: start + refresh overview + snapshot`);
console.log(`  ${padMs(warmMs)} ms  warm: snapshot re-fetch`);
console.log(`  health generation=${health.generation} slices=${Object.keys(health.slices ?? {}).length} failing=${(health.summary?.failingSlices ?? []).length}`);
console.log("");

const results = [
  gate("cold first snapshot", coldMs, 5000),
  gate("warm snapshot", warmMs, 1000)
];

console.log("");
console.log("  Poll tier targets (configured in poll-groups.ts, not measured here):");
console.log("    critical ≤ 2000 ms");
console.log("    queue    ≤ 5000 ms");
console.log("    ops      ≤ 10000 ms");
console.log("");

process.exitCode = results.every(Boolean) ? 0 : 1;

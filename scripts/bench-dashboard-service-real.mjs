#!/usr/bin/env node
/**
 * Real-workspace dashboard-service benchmark.
 *
 * Unlike bench-dashboard-service.mjs (which uses a synthetic empty SQLite),
 * this bench runs against the ACTUAL workspace at process.cwd() so the real
 * data volume is exercised. This demonstrates the incremental-refresh win
 * from the router-bypass change more clearly: multiple sequential single-slice
 * refreshes reuse the one warm store connection instead of re-entering the
 * router / registry / policy machinery each time.
 *
 * Run from the repo root after `pnpm run build`:
 *   node scripts/bench-dashboard-service-real.mjs
 */
import { performance } from "node:perf_hooks";
import { createDashboardService } from "../dist/services/dashboard-service/server.js";

const workspacePath = process.cwd();

function padMs(ms) {
  return Math.round(ms).toString().padStart(7);
}

function gate(label, ms, limitMs) {
  const ok = ms <= limitMs;
  console.log(`  ${ok ? "✓" : "✗"} ${label}: ${padMs(ms)} ms  (limit ${limitMs} ms)`);
  return ok;
}

console.log(`\nDashboard Option B real-workspace benchmark`);
console.log(`  workspace: ${workspacePath}\n`);

// ── Start service (no synthetic seeding) ──────────────────────────────────────
const t0 = performance.now();
// Use slow poll intervals so timer ticks don't interfere with measurements.
const svc = await createDashboardService({
  workspacePath,
  pollIntervalMs: { critical: 60000, live: 60000, queue: 60000, ops: 60000, status: 60000 }
});
const base = `http://${svc.host}:${svc.port}`;
const startMs = performance.now() - t0;

// ── Cold: single overview refresh + snapshot ────────────────────────────────
const t1 = performance.now();
await fetch(`${base}/dashboard/refresh`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ slices: ["overview"] })
});
const snap1 = await (await fetch(`${base}/dashboard/snapshot`)).json();
const coldMs = performance.now() - t1;

// ── Store already warm: verify open count ──────────────────────────────────
const openAfterFirst = svc.refresher.getStoreOpenCount();

// ── Second refresh (different slice, same warm store) ─────────────────────
const t2 = performance.now();
await fetch(`${base}/dashboard/refresh`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ slices: ["queue"] })
});
const snap2 = await (await fetch(`${base}/dashboard/snapshot`)).json();
const secondSliceMs = performance.now() - t2;
const openAfterSecond = svc.refresher.getStoreOpenCount();

// ── Third refresh (another different slice, same warm store) ────────────────
const t3 = performance.now();
await fetch(`${base}/dashboard/refresh`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ slices: ["status"] })
});
const snap3 = await (await fetch(`${base}/dashboard/snapshot`)).json();
const thirdSliceMs = performance.now() - t3;
const openAfterThird = svc.refresher.getStoreOpenCount();

// ── Warm snapshot serve (no refresh, just read from memory) ───────────────
const t4 = performance.now();
await (await fetch(`${base}/dashboard/snapshot`)).json();
const warmSnapMs = performance.now() - t4;

const health = await (await fetch(`${base}/health`)).json();

await svc.stop();

console.log(`  Service startup:             ${padMs(startMs)} ms`);
console.log(`  Cold (first refresh: overview): ${padMs(coldMs)} ms`);
console.log(`  Warm (2nd refresh: queue):      ${padMs(secondSliceMs)} ms`);
console.log(`  Warm (3rd refresh: status):     ${padMs(thirdSliceMs)} ms`);
console.log(`  Warm snapshot (memory serve):   ${padMs(warmSnapMs)} ms`);
console.log(`\n  Store open count after 1st refresh: ${openAfterFirst} (expected 1)`);
console.log(`  Store open count after 2nd refresh: ${openAfterSecond} (expected 1)`);
console.log(`  Store open count after 3rd refresh: ${openAfterThird} (expected 1)`);
console.log(`\n  health: generation=${health.generation} slices=${Object.keys(health.slices ?? {}).length} failing=${(health.summary?.failingSlices ?? []).length}`);
console.log(`  snap1 slices loaded: ${Object.values(snap1.slices ?? {}).filter(s => s.status === "fresh").length}`);
console.log(`  snap3 slices loaded: ${Object.values(snap3.slices ?? {}).filter(s => s.status === "fresh").length}`);

console.log("\n  SLA gates:");
const results = [
  gate("cold first refresh + snapshot", coldMs, 10000),
  gate("2nd slice refresh (warm store)", secondSliceMs, 5000),
  gate("3rd slice refresh (warm store)", thirdSliceMs, 5000),
  gate("warm snapshot memory serve",     warmSnapMs,   100)
];

if (openAfterThird === 1) {
  console.log("  ✓ store opened exactly once across 3 sequential refreshes");
} else {
  console.log(`  ✗ store opened ${openAfterThird} times (expected 1)`);
  results.push(false);
}

console.log("");
process.exitCode = results.every(Boolean) ? 0 : 1;

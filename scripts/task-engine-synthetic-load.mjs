#!/usr/bin/env node
/**
 * Maintainer-only synthetic load harness (Phase 35 / T520).
 * Not part of `pnpm test` — run manually from repo root after `pnpm run build`:
 *
 *   node scripts/task-engine-synthetic-load.mjs
 *   node scripts/task-engine-synthetic-load.mjs 500
 *
 * Exits 0 after printing timing; fails if a single list-tasks pass exceeds 30s (regression tripwire).
 */

import { mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { TaskStore } from "../dist/modules/task-engine/persistence/store.js";
import { SqliteDualPlanningStore } from "../dist/modules/task-engine/persistence/sqlite-dual-planning.js";
import { taskEngineModule } from "../dist/modules/task-engine/index.js";

const n = Math.min(Math.max(Number.parseInt(process.argv[2] ?? "200", 10) || 200, 10), 50_000);
const maxListMs = 30_000;

const tmp = await mkdtemp(path.join(os.tmpdir(), "wk-synth-"));
try {
  await mkdir(path.join(tmp, ".workspace-kit", "tasks"), { recursive: true });
  const dual = new SqliteDualPlanningStore(tmp, ".workspace-kit/tasks/workspace-kit.db");
  dual.loadFromDisk();
  const store = TaskStore.forSqliteDual(dual);
  await store.load();
  const now = new Date().toISOString();
  for (let i = 0; i < n; i++) {
    const id = `T${String(900000 + i)}`;
    store.addTask({
      id,
      status: "ready",
      type: "workspace-kit",
      title: `Synthetic ${i}`,
      createdAt: now,
      updatedAt: now,
      priority: i % 3 === 0 ? "P1" : "P2"
    });
  }
  await store.save();

  const ctx = {
    runtimeVersion: "0.1",
    workspacePath: tmp,
    effectiveConfig: {
      tasks: {
        persistenceBackend: "sqlite",
        sqliteDatabaseRelativePath: ".workspace-kit/tasks/workspace-kit.db"
      }
    }
  };

  const t0 = performance.now();
  const result = await taskEngineModule.onCommand({ name: "list-tasks", args: { status: "ready" } }, ctx);
  const ms = performance.now() - t0;
  if (!result.ok) {
    console.error(result);
    process.exitCode = 1;
  } else if (ms > maxListMs) {
    console.error(`list-tasks exceeded ${maxListMs}ms (${ms.toFixed(0)}ms) for n=${n}`);
    process.exitCode = 1;
  } else {
    console.log(
      JSON.stringify(
        {
          schemaVersion: 1,
          taskCount: n,
          listTasksMs: Math.round(ms * 100) / 100,
          returned: result.data?.count ?? null
        },
        null,
        2
      )
    );
  }
} finally {
  await rm(tmp, { recursive: true, force: true });
}

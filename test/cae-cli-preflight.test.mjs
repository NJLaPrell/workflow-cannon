/**
 * CAE shadow preflight (**`T864`**) — metadata attach + non-blocking degradation.
 */
import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

import {
  ModuleCommandRouter,
  ModuleRegistry,
  mergeCaeIntoCommandResult,
  runCaeCliPreflight,
  workspaceConfigModule,
  contextActivationModule,
  taskEngineModule
} from "../dist/index.js";
import { prepareKitSqliteDatabase } from "../dist/core/state/workspace-kit-sqlite.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function workspaceWithTaskRow() {
  const ws = await mkdtemp(path.join(os.tmpdir(), "wk-cae-preflight-"));
  await cp(path.join(root, ".ai"), path.join(ws, ".ai"), { recursive: true });
  const dbDir = path.join(ws, ".workspace-kit", "tasks");
  await mkdir(dbDir, { recursive: true });
  const db = new Database(path.join(dbDir, "workspace-kit.db"));
  prepareKitSqliteDatabase(db);
  db.prepare(
    `INSERT INTO task_engine_tasks (
      id, status, type, title, created_at, updated_at, archived, depends_on_json, unblocks_json,
      phase_key, features_json, metadata_json, risk
    ) VALUES (?, ?, ?, ?, ?, ?, 0, '[]', '[]', ?, ?, ?, ?)`
  ).run(
    "T999",
    "in_progress",
    "workspace-kit",
    "Hydrated CAE preflight task",
    "2026-04-25T00:00:00.000Z",
    "2026-04-25T00:00:00.000Z",
    "70",
    JSON.stringify(["doc-generation"]),
    JSON.stringify({ phaseProgram: "phase-70-cae-follow-on", ignored: "nope" }),
    "medium"
  );
  db.close();
  return ws;
}

test("runCaeCliPreflight: skipped when kit.cae.enabled is false", () => {
  const registry = new ModuleRegistry([
    workspaceConfigModule,
    contextActivationModule,
    taskEngineModule
  ]);
  const router = new ModuleCommandRouter(registry);
  const r = runCaeCliPreflight({
    workspacePath: root,
    effective: { kit: { cae: { enabled: false, runtime: { shadowPreflight: true } } } },
    subcommand: "cae-health",
    commandArgs: { schemaVersion: 1 },
    router
  });
  assert.equal(r.shadowAttach, null);
});

test("runCaeCliPreflight: attaches shadow metadata when enabled + shadowPreflight", () => {
  const registry = new ModuleRegistry([
    workspaceConfigModule,
    contextActivationModule,
    taskEngineModule
  ]);
  const router = new ModuleCommandRouter(registry);
  const r = runCaeCliPreflight({
    workspacePath: root,
    effective: {
      kit: {
        currentPhaseNumber: 70,
        cae: {
          enabled: true,
          registryStore: "json",
          runtime: { shadowPreflight: true },
          enforcement: { enabled: false }
        }
      }
    },
    subcommand: "list-tasks",
    commandArgs: { schemaVersion: 1 },
    router
  });
  assert.ok(r.shadowAttach);
  assert.equal(r.shadowAttach.schemaVersion, 1);
  assert.equal(r.shadowAttach.evalMode, "shadow");
  assert.ok(typeof r.shadowAttach.traceId === "string");
  assert.equal(r.enforcementDenial, null);
});

test("mergeCaeIntoCommandResult nests under data.cae", () => {
  const merged = mergeCaeIntoCommandResult(
    { ok: true, code: "ok", data: { schemaVersion: 1, x: 1 } },
    { schemaVersion: 1, traceId: "t" }
  );
  assert.equal(merged.data.cae.traceId, "t");
  assert.equal(merged.data.x, 1);
});

test("runCaeCliPreflight: hydrates bounded task context from SQLite when taskId is present", async () => {
  const ws = await workspaceWithTaskRow();
  const registry = new ModuleRegistry([
    workspaceConfigModule,
    contextActivationModule,
    taskEngineModule
  ]);
  const router = new ModuleCommandRouter(registry);
  const r = runCaeCliPreflight({
    workspacePath: ws,
    effective: {
      tasks: { sqliteDatabaseRelativePath: ".workspace-kit/tasks/workspace-kit.db" },
      kit: {
        currentPhaseNumber: 70,
        cae: {
          enabled: true,
          registryStore: "json",
          runtime: { shadowPreflight: true },
          enforcement: { enabled: false }
        }
      }
    },
    subcommand: "get-next-actions",
    commandArgs: { taskId: "T999" },
    router
  });
  assert.ok(r.shadowAttach);
  assert.equal(r.shadowAttach.summary.reviewCount, 1);
});

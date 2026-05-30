/**
 * Phase service sync preflight (T100615).
 */
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { mkdir, mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { prepareKitSqliteDatabase } from "../dist/core/state/workspace-kit-sqlite.js";
import {
  buildPhaseServiceSyncPreflight,
  isPhaseServiceSyncPreflightActive
} from "../dist/modules/task-engine/phase-service-sync-preflight.js";
import { enqueueCanonicalEvent } from "../dist/modules/task-engine/persistence/canonical-event-outbox-store.js";
import { SqliteDualPlanningStore } from "../dist/modules/task-engine/persistence/sqlite-dual-planning.js";
import { TaskStore } from "../dist/modules/task-engine/persistence/store.js";
import { taskEngineModule } from "../dist/modules/task-engine/task-engine-internal.js";

async function tmpWorkspace() {
  return mkdtemp(path.join(os.tmpdir(), "wk-svc-preflight-"));
}

async function seedSqlite(workspace) {
  await mkdir(path.join(workspace, ".workspace-kit", "tasks"), { recursive: true });
  const dual = new SqliteDualPlanningStore(workspace, ".workspace-kit/tasks/workspace-kit.db");
  dual.loadFromDisk();
  const store = TaskStore.forSqliteDual(dual);
  await store.load();
  await store.save();
}

function initGit(workspace) {
  execSync("git init", { cwd: workspace, stdio: "ignore" });
  execSync('git config user.email "preflight@test"', { cwd: workspace, stdio: "ignore" });
  execSync('git config user.name "preflight"', { cwd: workspace, stdio: "ignore" });
}

function serviceModeCtx(workspace, dataSource = "service") {
  return {
    workspacePath: workspace,
    runtimeVersion: "0.1",
    effectiveConfig: {
      tasks: {
        canonicalAuthority: "git-event-log",
        persistenceBackend: "sqlite",
        sqliteDatabaseRelativePath: ".workspace-kit/tasks/workspace-kit.db"
      },
      dashboard: { dataSource }
    }
  };
}

test("isPhaseServiceSyncPreflightActive requires git-event-log and service/auto dataSource", () => {
  const base = { workspacePath: "/tmp/w", runtimeVersion: "0.1" };
  assert.equal(
    isPhaseServiceSyncPreflightActive({
      ...base,
      effectiveConfig: { tasks: { canonicalAuthority: "sqlite" }, dashboard: { dataSource: "service" } }
    }),
    false
  );
  assert.equal(
    isPhaseServiceSyncPreflightActive({
      ...base,
      effectiveConfig: {
        tasks: { canonicalAuthority: "git-event-log" },
        dashboard: { dataSource: "cli-polling" }
      }
    }),
    false
  );
  assert.equal(
    isPhaseServiceSyncPreflightActive({
      ...base,
      effectiveConfig: {
        tasks: { canonicalAuthority: "git-event-log" },
        dashboard: { dataSource: "auto" }
      }
    }),
    true
  );
  assert.equal(
    isPhaseServiceSyncPreflightActive({
      ...base,
      effectiveConfig: {
        tasks: { canonicalAuthority: "git-event-log" },
        dashboard: { dataSource: "service" }
      }
    }),
    true
  );
});

test("buildPhaseServiceSyncPreflight inactive for cli-polling", async () => {
  const workspace = await tmpWorkspace();
  await seedSqlite(workspace);
  initGit(workspace);
  const report = await buildPhaseServiceSyncPreflight(
    serviceModeCtx(workspace, "cli-polling")
  );
  assert.equal(report.active, false);
  assert.equal(report.passed, true);
  assert.equal(report.findingCount, 0);
});

test("buildPhaseServiceSyncPreflight blocks when service mode and daemon not running", async () => {
  const workspace = await tmpWorkspace();
  await seedSqlite(workspace);
  initGit(workspace);
  const report = await buildPhaseServiceSyncPreflight(serviceModeCtx(workspace, "service"));
  assert.equal(report.active, true);
  assert.equal(report.passed, false);
  assert.ok(
    report.findings.some((row) => row.code === "service-sync-service-not-running" && row.severity === "blocking")
  );
});

test("buildPhaseServiceSyncPreflight blocks on undrained outbox", async () => {
  const workspace = await tmpWorkspace();
  await seedSqlite(workspace);
  initGit(workspace);
  const dual = new SqliteDualPlanningStore(workspace, ".workspace-kit/tasks/workspace-kit.db");
  dual.loadFromDisk();
  const db = dual.getDatabase();
  prepareKitSqliteDatabase(db);
  enqueueCanonicalEvent(
    db,
    {
      schemaVersion: 1,
      eventId: "evt-pending",
      sequence: 0,
      parentEventId: null,
      recordedAt: "2026-05-30T12:00:00.000Z",
      actor: { id: "test", source: "explicit" },
      command: { name: "unit-test" },
      kind: "task.updated",
      payload: { taskId: "T1" }
    },
    { rowId: "row-pending" }
  );

  const report = await buildPhaseServiceSyncPreflight(serviceModeCtx(workspace, "auto"));
  assert.equal(report.active, true);
  assert.ok(
    report.findings.some((row) => row.code === "service-sync-outbox-not-drained" && row.severity === "blocking")
  );
  assert.ok(report.blockingFindingCount >= 1);
});

test("phase-delivery-preflight embeds serviceSync and counts blocking findings", async () => {
  const workspace = await tmpWorkspace();
  await seedSqlite(workspace);
  initGit(workspace);
  const ctx = {
    ...serviceModeCtx(workspace, "auto"),
    effectiveConfig: {
      ...serviceModeCtx(workspace, "auto").effectiveConfig,
      kit: { currentPhaseNumber: 124, currentPhaseLabel: "Phase 124" }
    }
  };

  const result = await taskEngineModule.onCommand(
    { name: "phase-delivery-preflight", args: { phaseKey: "124", includeInProgress: false } },
    ctx
  );

  assert.equal(result.ok, true);
  assert.equal(result.data.serviceSync?.active, true);
  assert.equal(typeof result.data.serviceSync?.blockingFindingCount, "number");
  assert.ok(result.data.blockingFindingCount >= result.data.serviceSync.blockingFindingCount);
});

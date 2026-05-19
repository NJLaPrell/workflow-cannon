import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { harvestDeliveryEvidencePreview } from "../dist/modules/task-engine/harvest-delivery-evidence-runtime.js";
import { taskEngineModule } from "../dist/index.js";
import { SqliteDualPlanningStore, TaskStore } from "../dist/index.js";

async function tmpDir() {
  return mkdtemp(path.join(os.tmpdir(), "wk-harvest-"));
}

function sqliteTaskEngineCtx(workspace) {
  return {
    runtimeVersion: "0.1",
    workspacePath: workspace,
    effectiveConfig: {
      tasks: {
        persistenceBackend: "sqlite",
        sqliteDatabaseRelativePath: ".workspace-kit/tasks/workspace-kit.db",
        planningGenerationPolicy: "off"
      }
    }
  };
}

async function seedSqliteStore(workspace, fn) {
  await mkdir(path.join(workspace, ".workspace-kit", "tasks"), { recursive: true });
  const dual = new SqliteDualPlanningStore(workspace, ".workspace-kit/tasks/workspace-kit.db");
  dual.loadFromDisk();
  const store = TaskStore.forSqliteDual(dual);
  await store.load();
  fn(store);
  await store.save();
}

function makeTask(overrides = {}) {
  const now = new Date().toISOString();
  return {
    id: "T100211",
    status: "in_progress",
    type: "workspace-kit",
    title: "Harvest test",
    createdAt: now,
    updatedAt: now,
    phaseKey: "103",
    ...overrides
  };
}

test("harvestDeliveryEvidencePreview reports missing PR fields without gh", () => {
  const preview = harvestDeliveryEvidencePreview({
    workspacePath: process.cwd(),
    branchName: "feature/T100211-delivery-evidence-harvester",
    baseBranch: "release/phase-103",
    mergeSha: "abc123def456",
    validationCommands: [{ command: "pnpm run check", exitCode: 0 }]
  });
  assert.equal(preview.schemaVersion, 1);
  assert.ok(preview.missingFields.includes("deliveryEvidence.prUrl"));
  assert.ok(preview.remediationCommands.length > 0);
  assert.equal(preview.signalStatus.git, "ok");
});

test("taskEngineModule harvest-delivery-evidence preview for in-progress task", async () => {
  const workspace = await tmpDir();
  try {
    await seedSqliteStore(workspace, (store) => {
      store.addTask(makeTask());
    });
    const result = await taskEngineModule.onCommand(
      { name: "harvest-delivery-evidence", args: { taskId: "T100211" } },
      sqliteTaskEngineCtx(workspace)
    );
    assert.equal(result.ok, true);
    assert.equal(result.code, "harvest-delivery-evidence-preview");
    assert.ok(Array.isArray(result.data.missingFields));
    assert.ok(result.data.deliveryEvidence);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

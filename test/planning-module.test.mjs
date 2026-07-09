import assert from "node:assert/strict";
import crypto from "node:crypto";
import { constants } from "node:fs";
import { access, mkdir, mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { fileURLToPath } from "node:url";

import { planningModule, taskEngineModule } from "../dist/index.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
import { TaskStore } from "../dist/modules/task-engine/persistence/store.js";
import { SqliteDualPlanningStore } from "../dist/modules/task-engine/persistence/sqlite-dual-planning.js";

const SQLITE_CFG = { tasks: { persistenceBackend: "sqlite" } };

async function loadSqliteTaskStore(workspace) {
  await mkdir(path.join(workspace, ".workspace-kit", "tasks"), { recursive: true });
  const dual = new SqliteDualPlanningStore(workspace, ".workspace-kit/tasks/workspace-kit.db");
  dual.loadFromDisk();
  const store = TaskStore.forSqliteDual(dual);
  await store.load();
  return store;
}

async function tmpDir(prefix = "planning-") {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

test("planningModule draft-plan-artifact persist:true writes artifact JSON", async () => {
  const workspace = await tmpDir();
  const artifact = JSON.parse(
    await readFile(
      path.join(repoRoot, "fixtures/planning/plan-artifact-minimal.valid.v1.json"),
      "utf8"
    )
  );
  const planId = crypto.randomUUID();
  artifact.planId = planId;
  artifact.planRef = `plan-artifact:${planId}`;
  const result = await planningModule.onCommand(
    {
      name: "draft-plan-artifact",
      args: {
        persist: true,
        artifact,
        expectedPlanningGeneration: 0,
        policyApproval: { confirmed: true, rationale: "test persist" }
      }
    },
    { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG }
  );
  assert.equal(result.ok, true);
  assert.equal(result.code, "plan-artifact-draft-persisted");
  assert.equal(result.data.planId, planId);
  assert.equal(result.data.version, 1);
  assert.ok(String(result.data.storagePath).includes(planId));
  const stored = JSON.parse(
    await readFile(
      path.join(workspace, result.data.storagePath),
      "utf8"
    )
  );
  assert.equal(stored.planId, planId);
  assert.equal(stored.version, 1);
});

test("planningModule list-planning-types returns typed workflow descriptors", async () => {
  const workspace = await tmpDir();
  const result = await planningModule.onCommand(
    { name: "list-planning-types", args: {} },
    { runtimeVersion: "0.1", workspacePath: workspace }
  );
  assert.equal(result.ok, true);
  assert.equal(result.code, "planning-types-listed");
  assert.equal(result.data.responseSchemaVersion, 1);
  assert.ok(Array.isArray(result.data.planningTypes));
  assert.ok(result.data.planningTypes.some((x) => x.type === "new-feature"));
});

test("planningModule explain-planning-rules returns effective defaults and questions", async () => {
  const workspace = await tmpDir();
  const result = await planningModule.onCommand(
    { name: "explain-planning-rules", args: { planningType: "new-feature" } },
    {
      runtimeVersion: "0.1",
      workspacePath: workspace,
      effectiveConfig: {
        planning: {
          defaultQuestionDepth: "guided"
        }
      }
    }
  );
  assert.equal(result.ok, true);
  assert.equal(result.code, "planning-rules-explained");
  assert.equal(result.data.responseSchemaVersion, 1);
  assert.equal(result.data.defaultQuestionDepth, "guided");
  assert.equal(result.data.adaptiveFinalizePolicy, "off");
  assert.ok(Array.isArray(result.data.baseQuestions));
});

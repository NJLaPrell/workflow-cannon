import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import Ajv2020 from "ajv/dist/2020.js";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

import { TaskStore, SqliteDualPlanningStore, taskEngineModule } from "../dist/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const schemaPath = path.join(root, "schemas/agent-phase-focus-dashboard-contract.v1.json");
const schemaId = "https://workflow-cannon.dev/schemas/agent-phase-focus-dashboard-contract.v1.json";

function makeTask(overrides = {}) {
  const now = new Date().toISOString();
  return {
    id: "T001",
    status: "ready",
    type: "workspace-kit",
    title: "Test task",
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

async function tmpDir(prefix = "pfd-") {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

function sqliteTaskEngineCtx(workspace) {
  return {
    runtimeVersion: "0.1",
    workspacePath: workspace,
    effectiveConfig: {
      tasks: {
        persistenceBackend: "sqlite",
        sqliteDatabaseRelativePath: ".workspace-kit/tasks/workspace-kit.db"
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

function schemaValidator() {
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  ajv.addSchema(JSON.parse(fs.readFileSync(schemaPath, "utf8")));
  return ajv.getSchema(schemaId);
}

test("phase-focus-dashboard scopes queue and readyTop to phaseKey", async () => {
  const workspace = await tmpDir();
  await seedSqliteStore(workspace, (store) => {
    store.addTask(makeTask({ id: "T10001", status: "ready", phaseKey: "100", priority: "P1", title: "In phase" }));
    store.addTask(makeTask({ id: "T10002", status: "proposed", phaseKey: "100", title: "Proposed in phase" }));
    store.addTask(makeTask({ id: "T99001", status: "ready", phaseKey: "99", title: "Other phase" }));
  });
  const ctx = sqliteTaskEngineCtx(workspace);

  const result = await taskEngineModule.onCommand(
    { name: "phase-focus-dashboard", args: { phaseKey: "100" } },
    ctx
  );

  assert.equal(result.ok, true);
  assert.equal(result.code, "phase-focus-dashboard");
  const focus = result.data.phaseFocus;
  assert.equal(focus.schemaVersion, 1);
  assert.equal(focus.phaseKey, "100");
  assert.equal(focus.queue.ready, 1);
  assert.equal(focus.queue.proposed, 1);
  assert.equal(focus.readyTop.length, 1);
  assert.equal(focus.readyTop[0].id, "T10001");

  const validate = schemaValidator();
  assert.equal(validate(focus), true, validate.errors?.map((e) => e.message).join("; "));
});

test("dashboard-summary includePhaseFocus adds phaseFocus slice", async () => {
  const workspace = await tmpDir();
  await seedSqliteStore(workspace, (store) => {
    store.addTask(makeTask({ id: "T10020", status: "ready", phaseKey: "100" }));
  });
  const ctx = sqliteTaskEngineCtx(workspace);

  const result = await taskEngineModule.onCommand(
    { name: "dashboard-summary", args: { includePhaseFocus: true, phaseKey: "100" } },
    ctx
  );

  assert.equal(result.ok, true);
  assert.equal(result.data.schemaVersion, 7);
  assert.equal(result.data.phaseFocus.phaseKey, "100");
  assert.equal(result.data.phaseFocus.readyTop[0].id, "T10020");
});

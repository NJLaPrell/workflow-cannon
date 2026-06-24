import assert from "node:assert/strict";
import { mkdtemp, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { runCli } from "../dist/cli.js";
import { SqliteDualPlanningStore, TaskStore, taskEngineModule } from "../dist/index.js";

function createCapture() {
  const lines = [];
  const errors = [];
  return {
    lines,
    errors,
    writeLine(message) {
      lines.push(message);
    },
    writeError(message) {
      errors.push(message);
    }
  };
}

function makeTask(overrides = {}) {
  const now = new Date().toISOString();
  return {
    id: "T001",
    status: "ready",
    type: "workspace-kit",
    title: "Kickoff scope task",
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

async function tmpDir(prefix = "kickoff-readiness-") {
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

describe("phase-kickoff-readiness command", () => {
  it("returns schema-only JSON schema", async () => {
    const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
    const capture = createCapture();
    const code = await runCli(["run", "phase-kickoff-readiness", "--schema-only", "{}"], {
      cwd: repoRoot,
      ...capture
    });
    assert.equal(code, 0, capture.errors.join("\n") || capture.lines.join("\n"));
    const result = JSON.parse(capture.lines.join(""));
    assert.equal(result.ok, true);
    assert.equal(result.code, "run-args-schema");
    assert.equal(result.command, "phase-kickoff-readiness");
    assert.equal(result.schema?.type, "object");
  });

  it("returns ok:true with slices and findings for a phaseKey", async () => {
    const workspace = await tmpDir();
    const staleUpdatedAt = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    await seedSqliteStore(workspace, (store) => {
      store.addTask(
        makeTask({
          id: "T100433A",
          phaseKey: "137",
          status: "ready",
          updatedAt: staleUpdatedAt,
          technicalScope: ["Touch `src/modules/task-engine/phase-kickoff-readiness-runtime.ts`"]
        })
      );
      store.addTask(
        makeTask({
          id: "T100433B",
          phaseKey: "137",
          status: "ready",
          dependsOn: ["T999"],
          title: "Blocked by dependency"
        })
      );
    });

    const result = await taskEngineModule.onCommand(
      {
        name: "phase-kickoff-readiness",
        args: { phaseKey: "137", includeValidationPlans: false }
      },
      sqliteTaskEngineCtx(workspace)
    );

    assert.equal(result.ok, true);
    assert.equal(result.code, "phase-kickoff-readiness");
    assert.equal(result.data.schemaVersion, 1);
    assert.equal(result.data.phaseKey, "137");
    assert.equal(typeof result.data.passed, "boolean");
    assert.ok(Array.isArray(result.data.findings));
    assert.ok(result.data.slices?.planning);
    assert.ok(result.data.slices?.git);
    assert.ok(result.data.slices?.scope);
    assert.ok(result.data.slices?.validation);
    assert.ok(result.data.slices?.doctor);
    assert.ok(
      result.data.findings.some(
        (f) => f.code === "kickoff-planning-stale-task" && f.severity === "warn" && f.taskId === "T100433A"
      )
    );
    assert.ok(
      result.data.findings.some(
        (f) =>
          f.code === "kickoff-planning-dependency-blocked" &&
          f.severity === "warn" &&
          f.taskId === "T100433B"
      )
    );
    for (const finding of result.data.findings) {
      assert.ok(["advisory", "warn", "block"].includes(finding.severity));
      assert.equal(typeof finding.code, "string");
      assert.equal(typeof finding.message, "string");
    }
    const hasBlock = result.data.findings.some((f) => f.severity === "block");
    assert.equal(result.data.passed, !hasBlock);
  });

  it("does not mutate the task store", async () => {
    const workspace = await tmpDir();
    await seedSqliteStore(workspace, (store) => {
      store.addTask(makeTask({ id: "T100433C", phaseKey: "137", status: "ready" }));
    });
    const dual = new SqliteDualPlanningStore(workspace, ".workspace-kit/tasks/workspace-kit.db");
    dual.loadFromDisk();
    const store = TaskStore.forSqliteDual(dual);
    await store.load();
    const beforeUpdated = store.getTask("T100433C")?.updatedAt;

    await taskEngineModule.onCommand(
      { name: "phase-kickoff-readiness", args: { phaseKey: "137", includeValidationPlans: false } },
      sqliteTaskEngineCtx(workspace)
    );

    await store.load();
    const afterUpdated = store.getTask("T100433C")?.updatedAt;
    assert.equal(afterUpdated, beforeUpdated);
  });
});

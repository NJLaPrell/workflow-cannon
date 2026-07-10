import assert from "node:assert/strict";
import { mkdtemp, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { agentBugReportingModule } from "../dist/modules/agent-bug-reporting/index.js";
import { openPlanningStores } from "../dist/core/planning/index.js";

function sqliteCtx(workspace, partialEffective = {}) {
  const rawTasks = partialEffective.tasks;
  const taskExtra =
    rawTasks && typeof rawTasks === "object" && !Array.isArray(rawTasks) ? rawTasks : {};
  const { tasks: _drop, ...restTop } = partialEffective;
  return {
    runtimeVersion: "0.1",
    workspacePath: workspace,
    effectiveConfig: {
      ...restTop,
      tasks: {
        persistenceBackend: "sqlite",
        sqliteDatabaseRelativePath: ".workspace-kit/tasks/workspace-kit.db",
        ...taskExtra
      }
    }
  };
}

async function tmpWorkspace() {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "fbr-empty-"));
  await mkdir(path.join(workspace, ".workspace-kit", "tasks"), { recursive: true });
  return workspace;
}

test("file-bug-report first-run: empty task store + blank evidenceKey space still creates proposed improvement", async () => {
  const workspace = await tmpWorkspace();
  const ctx = sqliteCtx(workspace, {
    tasks: { planningGenerationPolicy: "require" }
  });

  const planningBefore = await openPlanningStores(ctx);
  assert.equal(planningBefore.taskStore.getAllTasks().length, 0);

  const created = await agentBugReportingModule.onCommand(
    {
      name: "file-bug-report",
      args: {
        title: "First bug on a blank ledger",
        symptom: "No prior bug-report tasks exist",
        evidenceKey: "bug:first-run:blank-space",
        clientMutationId: "bug:first-run:blank-space",
        issueKind: "bug-fix",
        command: "pnpm exec wk doctor",
        code: "phase-projection-count-regression",
        remediation: "Hydrate projection then re-file if needed"
      }
    },
    ctx
  );

  assert.equal(created.ok, true, created.message);
  assert.equal(created.code, "file-bug-report-created");
  assert.equal(created.data.task.type, "improvement");
  assert.equal(created.data.task.status, "proposed");
  assert.equal(created.data.task.metadata.evidenceKey, "bug:first-run:blank-space");
  assert.equal(created.data.task.metadata.filedVia, "file-bug-report");
  assert.equal(created.data.autoFilledExpectedPlanningGeneration, true);
  assert.match(created.data.task.metadata.supportingReasoning, /Symptom:/);
  assert.match(created.data.task.metadata.supportingReasoning, /Command:/);
  assert.match(created.data.task.metadata.supportingReasoning, /Code\/exit:/);
  assert.match(created.data.task.metadata.supportingReasoning, /Remediation:/);

  const planningAfter = await openPlanningStores(ctx);
  assert.equal(planningAfter.taskStore.getAllTasks().length, 1);
});

test("file-bug-report no-data filing: minimal title+symptom only (no evidenceKey / optional fields)", async () => {
  const workspace = await tmpWorkspace();
  const ctx = sqliteCtx(workspace);

  const planningBefore = await openPlanningStores(ctx);
  assert.equal(planningBefore.taskStore.getAllTasks().length, 0);

  const created = await agentBugReportingModule.onCommand(
    {
      name: "file-bug-report",
      args: {
        title: "Sparse report",
        symptom: "Agent had almost no crumbs"
      }
    },
    ctx
  );

  assert.equal(created.ok, true, created.message);
  assert.equal(created.code, "file-bug-report-created");
  assert.equal(created.data.task.type, "improvement");
  assert.equal(created.data.task.status, "proposed");
  assert.equal(created.data.task.metadata.issue, "Agent had almost no crumbs");
  assert.equal(created.data.task.metadata.filedVia, "file-bug-report");
  assert.equal(created.data.task.metadata.evidenceKey, undefined);
  assert.equal(created.data.task.metadata.command, undefined);
  assert.match(created.data.task.metadata.supportingReasoning, /^Symptom: Agent had almost no crumbs$/);

  const planningAfter = await openPlanningStores(ctx);
  assert.equal(planningAfter.taskStore.getAllTasks().length, 1);
});

test("file-bug-report first-run without evidenceKey still allows a second distinct filing", async () => {
  const workspace = await tmpWorkspace();
  const ctx = sqliteCtx(workspace);

  const first = await agentBugReportingModule.onCommand(
    {
      name: "file-bug-report",
      args: { title: "Report A", symptom: "First sparse symptom" }
    },
    ctx
  );
  const second = await agentBugReportingModule.onCommand(
    {
      name: "file-bug-report",
      args: { title: "Report B", symptom: "Second sparse symptom" }
    },
    ctx
  );

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.notEqual(first.data.task.id, second.data.task.id);
  assert.equal(first.code, "file-bug-report-created");
  assert.equal(second.code, "file-bug-report-created");
});

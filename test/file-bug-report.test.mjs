import assert from "node:assert/strict";
import { mkdtemp, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { agentBugReportingModule } from "../dist/modules/agent-bug-reporting/index.js";
import { getPolicySensitivityForBuiltinCommand } from "../dist/core/policy.js";
import { enforcePlanningGenerationCliPrelude } from "../dist/core/run-args-pilot-validation.js";

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
  const workspace = await mkdtemp(path.join(os.tmpdir(), "fbr-"));
  await mkdir(path.join(workspace, ".workspace-kit", "tasks"), { recursive: true });
  return workspace;
}

test("file-bug-report is Tier C non-sensitive and not on CLI PG prelude", () => {
  assert.equal(getPolicySensitivityForBuiltinCommand("file-bug-report"), "non-sensitive");
  const preludeBlock = enforcePlanningGenerationCliPrelude(
    "file-bug-report",
    {},
    { tasks: { planningGenerationPolicy: "require" } }
  );
  assert.equal(preludeBlock, null);
});

test("file-bug-report happy path creates improvement@proposed with rich metadata", async () => {
  const workspace = await tmpWorkspace();
  const ctx = sqliteCtx(workspace);

  const created = await agentBugReportingModule.onCommand(
    {
      name: "file-bug-report",
      args: {
        title: "Shell mangled JSON",
        symptom: "Inline JSON broke on create-task",
        command: "pnpm exec wk run create-task '{...}'",
        code: "exit 2 invalid-run-args",
        remediation: "Pass argv via heredoc or single quotes",
        relatedTaskId: "T100001",
        issueKind: "agent-ergonomics",
        evidenceKey: "bug:cli-parse:zsh-mangle",
        clientMutationId: "bug:cli-parse:zsh-mangle"
      }
    },
    ctx
  );

  assert.equal(created.ok, true);
  assert.equal(created.code, "file-bug-report-created");
  assert.equal(created.data.intent, "file-bug-report");
  assert.equal(created.data.wrappedCommand, "create-task");
  const task = created.data.task;
  assert.match(task.id, /^T\d+$/);
  assert.equal(task.type, "improvement");
  assert.equal(task.status, "proposed");
  assert.equal(task.metadata.issue, "Inline JSON broke on create-task");
  assert.match(task.metadata.supportingReasoning, /Symptom:/);
  assert.match(task.metadata.supportingReasoning, /Command:/);
  assert.match(task.metadata.supportingReasoning, /Code\/exit:/);
  assert.match(task.metadata.supportingReasoning, /Remediation:/);
  assert.equal(task.metadata.issueKind, "agent-ergonomics");
  assert.equal(task.metadata.relatedTaskId, "T100001");
  assert.equal(task.metadata.evidenceKey, "bug:cli-parse:zsh-mangle");
  assert.equal(task.metadata.filedVia, "file-bug-report");
  assert.ok(task.technicalScope.length >= 3);
  assert.ok(task.acceptanceCriteria.length >= 2);
});

test("file-bug-report rejects status=ready and non-improvement type", async () => {
  const workspace = await tmpWorkspace();
  const ctx = sqliteCtx(workspace);

  const ready = await agentBugReportingModule.onCommand(
    {
      name: "file-bug-report",
      args: {
        title: "Should fail",
        symptom: "Trying to create ready",
        status: "ready"
      }
    },
    ctx
  );
  assert.equal(ready.ok, false);
  assert.equal(ready.code, "file-bug-report-status-rejected");

  const badType = await agentBugReportingModule.onCommand(
    {
      name: "file-bug-report",
      args: {
        title: "Should fail",
        symptom: "Trying workspace-kit type",
        type: "workspace-kit"
      }
    },
    ctx
  );
  assert.equal(badType.ok, false);
  assert.equal(badType.code, "file-bug-report-type-rejected");
});

test("file-bug-report idempotent replay returns existing taskId for evidenceKey", async () => {
  const workspace = await tmpWorkspace();
  const ctx = sqliteCtx(workspace);
  const args = {
    title: "Dedupe me",
    symptom: "Same failure twice",
    evidenceKey: "bug:dedupe:key-1",
    clientMutationId: "bug:dedupe:key-1"
  };

  const first = await agentBugReportingModule.onCommand({ name: "file-bug-report", args }, ctx);
  assert.equal(first.ok, true);
  assert.equal(first.code, "file-bug-report-created");
  const taskId = first.data.task.id;

  const second = await agentBugReportingModule.onCommand({ name: "file-bug-report", args }, ctx);
  assert.equal(second.ok, true);
  assert.equal(second.code, "file-bug-report-idempotent-replay");
  assert.equal(second.data.task.id, taskId);
  assert.equal(second.data.taskId, taskId);
  assert.equal(second.data.replayed, true);
});

test("file-bug-report works under planningGenerationPolicy require without caller expectedPlanningGeneration", async () => {
  const workspace = await tmpWorkspace();
  const ctx = sqliteCtx(workspace, {
    tasks: { planningGenerationPolicy: "require" }
  });

  const created = await agentBugReportingModule.onCommand(
    {
      name: "file-bug-report",
      args: {
        title: "One-shot PG",
        symptom: "Child has no prior read",
        evidenceKey: "bug:pg:one-shot",
        // intentionally omit expectedPlanningGeneration
        clientMutationId: "bug:pg:one-shot"
      }
    },
    ctx
  );

  assert.equal(created.ok, true, created.message);
  assert.equal(created.code, "file-bug-report-created");
  assert.equal(created.data.task.type, "improvement");
  assert.equal(created.data.task.status, "proposed");
  assert.equal(created.data.autoFilledExpectedPlanningGeneration, true);
  assert.equal(typeof created.data.planningGeneration, "number");
});

test("file-bug-report requires title and symptom", async () => {
  const workspace = await tmpWorkspace();
  const ctx = sqliteCtx(workspace);
  const missing = await agentBugReportingModule.onCommand(
    { name: "file-bug-report", args: { title: "only title" } },
    ctx
  );
  assert.equal(missing.ok, false);
  assert.equal(missing.code, "invalid-run-args");
});

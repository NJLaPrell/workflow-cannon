import assert from "node:assert/strict";
import { mkdir, mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { planningModule, taskEngineModule } from "../dist/index.js";
import { writeIdeaPlanArtifactVersion } from "../dist/modules/planning/idea-plan/idea-plan-artifact-storage.js";

const SQLITE_CFG = { tasks: { persistenceBackend: "sqlite" } };
const PLAN_ID = "f7a3b891-c5d2-4e6f-9a08-1b2c3d4e5f60";
const PLAN_REF = `plan-artifact:${PLAN_ID}`;

async function tmpWorkspace() {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "check-delivery-status-"));
  await mkdir(path.join(workspace, ".workspace-kit", "tasks"), { recursive: true });
  await mkdir(path.join(workspace, ".workspace-kit", "planning", "plan-artifacts", PLAN_ID), {
    recursive: true
  });
  return { workspace };
}

function ctx(workspace) {
  return { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG };
}

function policyApproval() {
  return { confirmed: true, rationale: "test check-delivery-status" };
}

function acceptedDocument(taskRefs) {
  return {
    schemaVersion: 1,
    planId: PLAN_ID,
    version: 1,
    planRef: PLAN_REF,
    status: "accepted",
    ideaId: "I005",
    createdAt: "2026-07-02T09:00:00.000Z",
    updatedAt: "2026-07-02T13:00:00.000Z",
    acceptance: {
      acceptedAt: "2026-07-02T13:00:00.000Z",
      acceptedBy: "operator@example.com",
      acceptedVersion: 1
    },
    delivery: {
      phaseKey: "140",
      taskRefs
    }
  };
}

async function seedAcceptedPlan(workspace, taskRefs) {
  writeIdeaPlanArtifactVersion(workspace, acceptedDocument(taskRefs));
}

async function createTask(workspace, taskId, status) {
  const created = await taskEngineModule.onCommand(
    {
      name: "create-task",
      args: {
        id: taskId,
        title: `Delivery ref ${taskId}`,
        status: "ready",
        policyApproval: policyApproval()
      }
    },
    ctx(workspace)
  );
  assert.equal(created.ok, true, created.message);

  if (status === "ready") {
    return;
  }
  if (status === "cancelled") {
    const cancelled = await taskEngineModule.onCommand(
      {
        name: "run-transition",
        args: { taskId, action: "cancel", policyApproval: policyApproval() }
      },
      ctx(workspace)
    );
    assert.equal(cancelled.ok, true, cancelled.message);
    return;
  }

  const started = await taskEngineModule.onCommand(
    {
      name: "run-transition",
      args: { taskId, action: "start", policyApproval: policyApproval() }
    },
    ctx(workspace)
  );
  assert.equal(started.ok, true, started.message);

  if (status === "in_progress") {
    return;
  }
  if (status === "completed") {
    const completed = await taskEngineModule.onCommand(
      {
        name: "run-transition",
        args: { taskId, action: "complete", policyApproval: policyApproval() }
      },
      ctx(workspace)
    );
    assert.equal(completed.ok, true, completed.message);
  }
}

async function runCheck(workspace, extraArgs = {}) {
  const planningGeneration = (
    await planningModule.onCommand({ name: "list-ideas", args: {} }, ctx(workspace))
  ).data.planningGeneration;
  return planningModule.onCommand(
    {
      name: "check-delivery-status",
      args: {
        planRef: PLAN_REF,
        expectedPlanningGeneration: planningGeneration,
        policyApproval: policyApproval(),
        ...extraArgs
      }
    },
    ctx(workspace)
  );
}

test("check-delivery-status rejects when document is not in accepted state", async () => {
  const { workspace } = await tmpWorkspace();
  writeIdeaPlanArtifactVersion(workspace, {
    ...acceptedDocument([]),
    status: "planning"
  });
  const out = await runCheck(workspace);
  assert.equal(out.ok, false);
  assert.equal(out.code, "idea-plan-status-invalid");
});

test("check-delivery-status returns summary without transitioning when tasks are in progress", async () => {
  const { workspace } = await tmpWorkspace();
  await seedAcceptedPlan(workspace, ["T100901", "T100902"]);
  await createTask(workspace, "T100901", "completed");
  await createTask(workspace, "T100902", "in_progress");
  const out = await runCheck(workspace);
  assert.equal(out.ok, true);
  assert.equal(out.code, "delivery-status-checked");
  assert.equal(out.data.transitioned, false);
  assert.equal(out.data.status, "accepted");
  assert.deepEqual(out.data.deliveryStatus, {
    total: 2,
    completed: 1,
    cancelled: 0,
    pending: 1,
    missing: 0
  });
});

test("check-delivery-status transitions accepted to delivered when all refs terminal with min one completed", async () => {
  const { workspace } = await tmpWorkspace();
  await seedAcceptedPlan(workspace, ["T100903", "T100904"]);
  await createTask(workspace, "T100903", "completed");
  await createTask(workspace, "T100904", "cancelled");
  const out = await runCheck(workspace);
  assert.equal(out.ok, true);
  assert.equal(out.code, "idea-plan-delivered");
  assert.equal(out.data.transitioned, true);
  assert.equal(out.data.status, "delivered");
  assert.equal(out.data.version, 2);
  assert.equal(out.data.deliveryStatus.completed, 1);
  assert.equal(out.data.deliveryStatus.cancelled, 1);
});

test("check-delivery-status does not transition when all tasks are cancelled", async () => {
  const { workspace } = await tmpWorkspace();
  await seedAcceptedPlan(workspace, ["T100905"]);
  await createTask(workspace, "T100905", "cancelled");
  const out = await runCheck(workspace);
  assert.equal(out.ok, true);
  assert.equal(out.code, "delivery-status-checked");
  assert.equal(out.data.transitioned, false);
});

/** T100375 — execute-plan-artifact command + execute path policy gating. */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import { mkdir, mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { planningModule } from "../dist/index.js";
import { readLatestPlanArtifact } from "../dist/core/planning/plan-artifact-storage.js";
import { openPlanningStores } from "../dist/core/planning/index.js";
import { runTransitionOnCommand } from "../dist/modules/task-engine/commands/run-transition-on-command.js";
import { createPlanArtifactExecuteGuard, PLAN_EXECUTION_EVIDENCE_METADATA_KEY } from "../dist/modules/task-engine/plan-artifact-execute-policy.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturesDir = path.join(repoRoot, "fixtures", "planning");
const SQLITE_CFG = { tasks: { persistenceBackend: "sqlite", planArtifactExecute: { enforcementMode: "enforce" } } };

function loadFixture(name) { return JSON.parse(fs.readFileSync(path.join(fixturesDir, name), "utf8")); }
function freshArtifact(base) {
  const planId = crypto.randomUUID();
  const doc = structuredClone(base);
  doc.planId = planId; doc.planRef = `plan-artifact:${planId}`; doc.version = 1; doc.status = "draft";
  return doc;
}
function approvalFor(artifact, version = 1) {
  return { schemaVersion: 1, confirmed: true, approvedVersion: version, approvedAt: "2026-05-27T08:00:00.000Z", approvedBy: "operator@example.com", planRef: artifact.planRef };
}
async function tmpWorkspace() {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "wk-plan-execute-"));
  await mkdir(path.join(workspace, ".workspace-kit", "tasks"), { recursive: true });
  return workspace;
}
async function draftPersist(workspace, artifact) {
  const result = await planningModule.onCommand({ name: "draft-plan-artifact", args: { persist: true, artifact, expectedPlanningGeneration: 0, policyApproval: { confirmed: true, rationale: "setup" } } }, { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG });
  assert.equal(result.ok, true, result.message); return result;
}
async function acceptPlan(workspace, planId, artifact, planningGeneration) {
  const review = await planningModule.onCommand({ name: "review-plan-artifact", args: { planId, recordReview: true, expectedPlanningGeneration: planningGeneration, policyApproval: { confirmed: true, rationale: "review before accept" } } }, { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG });
  assert.equal(review.ok, true, review.message);
  const accept = await planningModule.onCommand({ name: "accept-plan-artifact", args: { planId, approvalRecord: approvalFor(artifact, review.data.version), expectedPlanningGeneration: review.data.planningGeneration ?? planningGeneration, policyApproval: { confirmed: true, rationale: "accept" } } }, { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG });
  assert.equal(accept.ok, true, accept.message); return accept;
}
async function seedReadyTask(workspace, taskId) {
  const stores = await openPlanningStores({ runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG });
  const now = new Date().toISOString();
  stores.sqliteDual.withTransaction(() => { stores.taskStore.addTask({ id: taskId, title: "Execute gating test task", type: "workspace-kit", status: "ready", createdAt: now, updatedAt: now, phase: "Phase 137", phaseKey: "137", approach: "Verify execute linkage", technicalScope: ["planning"], acceptanceCriteria: ["execute-plan-artifact records evidence"] }); });
  return stores;
}

describe("execute-plan-artifact (T100375)", () => {
  it("links task to accepted plan and bumps plan revision with executionLinkages", async () => {
    const workspace = await tmpWorkspace();
    const artifact = freshArtifact(loadFixture("plan-artifact-full-feature.valid.v1.json"));
    artifact.openQuestions = [];
    const draft = await draftPersist(workspace, artifact);
    await acceptPlan(workspace, draft.data.planId, artifact, draft.data.planningGeneration ?? 0);
    const stores = await seedReadyTask(workspace, "T900375");
    const execute = await planningModule.onCommand({ name: "execute-plan-artifact", args: { planId: draft.data.planId, taskId: "T900375", expectedPlanningGeneration: stores.sqliteDual.getPlanningGeneration(), policyApproval: { confirmed: true, rationale: "link" } } }, { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG });
    assert.equal(execute.ok, true, execute.message);
    assert.equal(execute.code, "plan-artifact-execute-linked");
    assert.equal(execute.data.evidenceBundle.command, "execute-plan-artifact");
    const latest = readLatestPlanArtifact(workspace, draft.data.planId);
    assert.ok(latest?.executionLinkages?.some((row) => row.taskId === "T900375"));
    const refreshed = await openPlanningStores({ runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG });
    assert.ok(refreshed.taskStore.getTask("T900375")?.metadata?.[PLAN_EXECUTION_EVIDENCE_METADATA_KEY]);
  });

  it("run-transition start blocked without linkage when enforcementMode is enforce", async () => {
    const workspace = await tmpWorkspace();
    const stores = await seedReadyTask(workspace, "T900376");
    const start = await runTransitionOnCommand({ runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG }, stores, stores.taskStore, { taskId: "T900376", action: "start", expectedPlanningGeneration: stores.sqliteDual.getPlanningGeneration(), policyApproval: { confirmed: true, rationale: "attempt start" } });
    assert.equal(start.ok, false);
    assert.match(start.message ?? "", /planExecutionEvidence|execute-plan-artifact|PlanArtifact/i);
  });

  it("run-transition start allowed after execute-plan-artifact", async () => {
    const workspace = await tmpWorkspace();
    const artifact = freshArtifact(loadFixture("plan-artifact-full-feature.valid.v1.json"));
    artifact.openQuestions = [];
    const draft = await draftPersist(workspace, artifact);
    await acceptPlan(workspace, draft.data.planId, artifact, draft.data.planningGeneration ?? 0);
    const stores = await seedReadyTask(workspace, "T900377");
    const execute = await planningModule.onCommand({ name: "execute-plan-artifact", args: { planId: draft.data.planId, taskId: "T900377", expectedPlanningGeneration: stores.sqliteDual.getPlanningGeneration(), policyApproval: { confirmed: true, rationale: "link" } } }, { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG });
    assert.equal(execute.ok, true, execute.message);
    const refreshed = await openPlanningStores({ runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG });
    const start = await runTransitionOnCommand({ runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG }, refreshed, refreshed.taskStore, { taskId: "T900377", action: "start", expectedPlanningGeneration: execute.data.planningGeneration ?? refreshed.sqliteDual.getPlanningGeneration(), policyApproval: { confirmed: true, rationale: "start" } });
    assert.equal(start.ok, true, start.message);
    assert.equal(refreshed.taskStore.getTask("T900377")?.status, "in_progress");
  });

  it("plan-artifact-execute guard bypasses local-only tasks", () => {
    const guard = createPlanArtifactExecuteGuard({ enforcementMode: "enforce", effectiveConfig: SQLITE_CFG });
    const result = guard.canTransition({ id: "T1", title: "local", type: "workspace-kit", status: "ready", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", phase: "Phase 1", approach: "local only", technicalScope: ["x"], acceptanceCriteria: ["y"], metadata: { localOnly: true } }, "in_progress", { allTasks: [], timestamp: "2026-01-01T00:00:00.000Z" });
    assert.equal(result.allowed, true);
    assert.equal(result.code, "plan-artifact-execute-not-required");
  });
});

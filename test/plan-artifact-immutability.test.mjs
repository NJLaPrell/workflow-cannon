import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { planningModule } from "../dist/index.js";
import { PlanArtifactVersionImmutableError, assertPlanArtifactVersionWritable, listPlanArtifactVersionSummaries } from "../dist/core/planning/plan-artifact-immutability.js";
import { readLatestPlanArtifact, readPlanArtifactVersion, writePlanArtifactVersion } from "../dist/core/planning/plan-artifact-storage.js";
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturesDir = path.join(repoRoot, "fixtures", "planning");
const SQLITE_CFG = { tasks: { persistenceBackend: "sqlite" } };
function loadFixture(name) { return JSON.parse(fs.readFileSync(path.join(fixturesDir, name), "utf8")); }
function freshDraftArtifact(base) { const planId = crypto.randomUUID(); const doc = structuredClone(base); doc.planId = planId; doc.planRef = `plan-artifact:${planId}`; doc.version = 1; doc.status = "draft"; return doc; }
function approvalFor(artifact, version = 1) { return { schemaVersion: 1, confirmed: true, approvedVersion: version, approvedAt: "2026-05-27T08:00:00.000Z", approvedBy: "operator@example.com", planRef: artifact.planRef }; }
async function tmpWorkspace() { const workspace = await mkdtemp(path.join(os.tmpdir(), "wk-plan-immut-")); await mkdir(path.join(workspace, ".workspace-kit", "tasks"), { recursive: true }); return workspace; }
function persistArgs(artifact, extra = {}) { return { persist: true, artifact, expectedPlanningGeneration: 0, policyApproval: { confirmed: true, rationale: "plan-artifact-immutability.test.mjs" }, ...extra }; }
async function recordReview(workspace, planId, planningGeneration) {
  const review = await planningModule.onCommand({ name: "review-plan-artifact", args: { planId, recordReview: true, expectedPlanningGeneration: planningGeneration, policyApproval: { confirmed: true, rationale: "immutability review" } } }, { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG });
  assert.equal(review.ok, true, review.message); return review;
}
async function acceptAfterReview(workspace, planId, artifact, planningGeneration) {
  const review = await recordReview(workspace, planId, planningGeneration);
  const accept = await planningModule.onCommand({ name: "accept-plan-artifact", args: { planId, approvalRecord: approvalFor(artifact, review.data.version), expectedPlanningGeneration: review.data.planningGeneration ?? planningGeneration, policyApproval: { confirmed: true, rationale: "immutability accept" } } }, { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG });
  assert.equal(accept.ok, true, accept.message); return accept;
}
async function draftPersist(workspace, artifact, extra = {}) { const result = await planningModule.onCommand({ name: "draft-plan-artifact", args: persistArgs(artifact, extra) }, { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG }); assert.equal(result.ok, true, result.message); return result; }
describe("PlanArtifact version immutability (T100754)", () => {
  it("bumps version when drafting after acceptance without mutating accepted row", async () => {
    const workspace = await tmpWorkspace(); const artifact = freshDraftArtifact(loadFixture("plan-artifact-full-feature.valid.v1.json")); artifact.openQuestions = [];
    const draft = await draftPersist(workspace, artifact);
    const accept = await acceptAfterReview(workspace, draft.data.planId, artifact, draft.data.planningGeneration ?? 0);
    const acceptedOnDisk = JSON.parse(await readFile(path.join(workspace, accept.data.storagePath), "utf8"));
    const secondBody = structuredClone(artifact); delete secondBody.version; secondBody.identity = { ...secondBody.identity, summary: "Replan after acceptance" };
    const replan = await planningModule.onCommand({ name: "draft-plan-artifact", args: persistArgs(secondBody, { expectedPlanningGeneration: accept.data.planningGeneration ?? 0 }) }, { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG });
    assert.equal(replan.data.version, accept.data.version + 1);
    const acceptedAfterReplan = JSON.parse(await readFile(path.join(workspace, accept.data.storagePath), "utf8"));
    assert.deepEqual(acceptedAfterReplan, acceptedOnDisk);
  });
  it("rejects draft persist targeting an accepted version number", async () => {
    const workspace = await tmpWorkspace(); const artifact = freshDraftArtifact(loadFixture("plan-artifact-full-feature.valid.v1.json")); artifact.openQuestions = [];
    const draft = await draftPersist(workspace, artifact);
    const accept = await acceptAfterReview(workspace, draft.data.planId, artifact, draft.data.planningGeneration ?? 0);
    const blocked = await planningModule.onCommand({ name: "draft-plan-artifact", args: persistArgs({ ...artifact, version: accept.data.version, identity: { ...artifact.identity, summary: "mutate accepted" } }, { expectedPlanningGeneration: accept.data.planningGeneration ?? 0 }) }, { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG });
    assert.equal(blocked.code, "plan-artifact-version-immutable");
  });
  it("writePlanArtifactVersion refuses in-place overwrite of accepted versions", () => {
    const workspace = path.join(os.tmpdir(), "wk-immut-" + crypto.randomUUID()); fs.mkdirSync(path.join(workspace, ".workspace-kit", "tasks"), { recursive: true });
    const artifact = freshDraftArtifact(loadFixture("plan-artifact-minimal.valid.v1.json")); const accepted = { ...artifact, status: "accepted" };
    writePlanArtifactVersion(workspace, accepted);
    assert.throws(() => writePlanArtifactVersion(workspace, { ...accepted, identity: { ...accepted.identity, summary: "nope" } }), PlanArtifactVersionImmutableError);
  });
  it("get-plan-artifact exposes version history and lineage metadata", async () => {
    const workspace = await tmpWorkspace(); const artifact = freshDraftArtifact(loadFixture("plan-artifact-minimal.valid.v1.json"));
    artifact.provenance = { ...artifact.provenance, sourceIdeaId: "I100754", previousPlanArtifacts: ["plan-artifact:older-plan"] };
    const draft = await draftPersist(workspace, artifact);
    const retrieved = await planningModule.onCommand({ name: "get-plan-artifact", args: { planId: draft.data.planId } }, { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG });
    assert.equal(retrieved.code, "plan-artifact-retrieved");
    assert.equal(retrieved.data.lineage.sourceIdeaId, "I100754");
    assert.equal(listPlanArtifactVersionSummaries(workspace, draft.data.planId).length, 1);
  });
});

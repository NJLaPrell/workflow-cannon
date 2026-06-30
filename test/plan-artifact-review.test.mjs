/**
 * WP-4.5 / T100463 — review-plan-artifact command wiring.
 * T100757 — review record persistence and session state updates.
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import { mkdir, mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { ideasModule, planningModule } from "../dist/index.js";
import {
  readLatestPlanArtifact,
  readPlanArtifactIndex
} from "../dist/core/planning/plan-artifact-storage.js";
import { getPlanningChatSession } from "../dist/modules/ideas/planning-chat-session.js";
import { SqliteDualPlanningStore } from "../dist/modules/task-engine/persistence/sqlite-dual-planning.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturesDir = path.join(repoRoot, "fixtures", "planning");
const SQLITE_CFG = { tasks: { persistenceBackend: "sqlite" } };

function loadFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(fixturesDir, name), "utf8"));
}

function freshArtifact(base) {
  const planId = crypto.randomUUID();
  const doc = structuredClone(base);
  doc.planId = planId;
  doc.planRef = `plan-artifact:${planId}`;
  doc.version = 1;
  doc.status = "draft";
  return doc;
}

async function tmpWorkspace() {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "wk-plan-review-"));
  await mkdir(path.join(workspace, ".workspace-kit", "tasks"), { recursive: true });
  return workspace;
}

function policyApproval() {
  return { confirmed: true, rationale: "plan-artifact-review.test.mjs" };
}

async function createIdea(workspace, title = "Review idea") {
  const created = await ideasModule.onCommand(
    { name: "create-idea", args: { title, policyApproval: policyApproval() } },
    { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG }
  );
  assert.equal(created.ok, true);
  return created.data.idea;
}

async function startPlanning(workspace, ideaId) {
  const started = await ideasModule.onCommand(
    { name: "start-idea-planning", args: { ideaId, policyApproval: policyApproval() } },
    { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG }
  );
  assert.equal(started.ok, true);
  return started.data;
}

function planningDb(workspace) {
  const dual = new SqliteDualPlanningStore(workspace, ".workspace-kit/tasks/workspace-kit.db");
  dual.loadFromDisk();
  return dual.getDatabase();
}

async function draftPersist(workspace, artifact) {
  const result = await planningModule.onCommand(
    {
      name: "draft-plan-artifact",
      args: {
        persist: true,
        artifact,
        expectedPlanningGeneration: 0,
        policyApproval: policyApproval()
      }
    },
    { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG }
  );
  assert.equal(result.ok, true, result.message);
  return result;
}

async function setDraftReady(workspace, ideaId, sessionId, planRef, version) {
  return ideasModule.onCommand(
    {
      name: "update-idea-planning-session",
      args: {
        ideaId,
        sessionId,
        status: "draft_ready",
        currentPlanRef: planRef,
        currentPlanVersion: version,
        expectedPlanningGeneration: 0,
        policyApproval: policyApproval()
      }
    },
    { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG }
  );
}

describe("review-plan-artifact command (T100463)", () => {
  it("requires planId or artifact", async () => {
    const workspace = await tmpWorkspace();
    const result = await planningModule.onCommand(
      { name: "review-plan-artifact", args: {} },
      { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG }
    );
    assert.equal(result.ok, false);
    assert.equal(result.code, "invalid-run-args");
  });

  it("returns plan-artifact-not-found for unknown planId", async () => {
    const workspace = await tmpWorkspace();
    const result = await planningModule.onCommand(
      {
        name: "review-plan-artifact",
        args: { planId: "550e8400-e29b-41d4-a716-446655440000", profile: "minimal" }
      },
      { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG }
    );
    assert.equal(result.ok, false);
    assert.equal(result.code, "plan-artifact-not-found");
  });

  it("reviews inline minimal fixture — complete", async () => {
    const workspace = await tmpWorkspace();
    const artifact = freshArtifact(loadFixture("plan-artifact-minimal.valid.v1.json"));
    const result = await planningModule.onCommand(
      {
        name: "review-plan-artifact",
        args: { artifact, profile: "minimal" }
      },
      { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG }
    );
    assert.equal(result.ok, true);
    assert.equal(result.code, "plan-artifact-review-complete");
    assert.equal(result.data.passed, true);
    assert.equal(result.data.profile, "minimal");
    assert.ok(Array.isArray(result.data.blockers));
    assert.ok(result.data.coverageMap?.goals);
    assert.ok(typeof result.data.reviewSummary === "string");
    assert.equal(typeof result.data.blockerCount, "number");
    assert.equal(typeof result.data.warningCount, "number");
    assert.equal(typeof result.data.wbsCount, "number");
    assert.ok(result.data.coverageSummary);
    assert.equal(result.data.reviewRecord.schemaVersion, 1);
    assert.equal(result.data.reviewRecord.blockerCount, result.data.blockerCount);
  });

  it("reviews inline blockers fixture — blocked with findings", async () => {
    const workspace = await tmpWorkspace();
    const artifact = freshArtifact(loadFixture("plan-artifact-review-blockers.v1.json"));
    const result = await planningModule.onCommand(
      {
        name: "review-plan-artifact",
        args: { artifact, profile: "refactor" }
      },
      { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG }
    );
    assert.equal(result.ok, true);
    assert.equal(result.code, "plan-artifact-review-blocked");
    assert.equal(result.data.passed, false);
    assert.ok(result.data.blockers.some((b) => b.code === "RUBRIC-COV-GOAL"));
    assert.equal(result.data.coverageMap.goals.uncovered.length, 1);
    assert.ok(result.data.blockerCount > 0);
  });

  it("loads stored plan by planId after draft persist", async () => {
    const workspace = await tmpWorkspace();
    const artifact = freshArtifact(loadFixture("plan-artifact-minimal.valid.v1.json"));
    const draft = await draftPersist(workspace, artifact);
    const result = await planningModule.onCommand(
      {
        name: "review-plan-artifact",
        args: { planId: draft.data.planId, profile: "minimal" }
      },
      { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG }
    );
    assert.equal(result.ok, true);
    assert.equal(result.code, "plan-artifact-review-complete");
    assert.equal(result.data.planId, draft.data.planId);
    assert.equal(result.data.version, 1);
  });

  it("recordReview persists reviewed status as next version", async () => {
    const workspace = await tmpWorkspace();
    const artifact = freshArtifact(loadFixture("plan-artifact-minimal.valid.v1.json"));
    const draft = await draftPersist(workspace, artifact);
    const result = await planningModule.onCommand(
      {
        name: "review-plan-artifact",
        args: {
          planId: draft.data.planId,
          profile: "minimal",
          recordReview: true,
          expectedPlanningGeneration: draft.data.planningGeneration ?? 0,
          policyApproval: policyApproval()
        }
      },
      { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG }
    );
    assert.equal(result.ok, true);
    assert.equal(result.data.recordReview, true);
    assert.equal(result.data.version, 2);
    assert.equal(result.data.status, "reviewed");
    const latest = readLatestPlanArtifact(workspace, draft.data.planId);
    assert.equal(latest?.version, 2);
    assert.equal(latest?.status, "reviewed");
    const index = readPlanArtifactIndex(workspace, draft.data.planId);
    assert.ok(index?.latestReview);
    assert.equal(index.latestReview.reviewedVersion, 2);
    assert.equal(index.latestReview.blockerCount, 0);
  });
});

describe("review-plan-artifact session + review record (T100757)", () => {
  it("recordReview with blockers moves session to needs_revision", async () => {
    const workspace = await tmpWorkspace();
    const idea = await createIdea(workspace, "Blocked review idea");
    const planning = await startPlanning(workspace, idea.id);
    const sessionId = planning.planningChatSession.sessionId;
    const artifact = freshArtifact(loadFixture("plan-artifact-review-blockers.v1.json"));
    artifact.provenance = { ...artifact.provenance, sourceIdeaId: idea.id, chatSessionRef: sessionId };
    const draft = await draftPersist(workspace, artifact);
    await setDraftReady(workspace, idea.id, sessionId, draft.data.planRef, draft.data.version);
    const result = await planningModule.onCommand(
      {
        name: "review-plan-artifact",
        args: {
          planId: draft.data.planId,
          profile: "refactor",
          recordReview: true,
          expectedPlanningGeneration: draft.data.planningGeneration ?? 0,
          policyApproval: policyApproval()
        }
      },
      { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG }
    );
    assert.equal(result.ok, true);
    assert.equal(result.data.passed, false);
    assert.ok(result.data.blockerCount > 0);
    assert.equal(result.data.planningChatSession?.status, "needs_revision");
    const stored = getPlanningChatSession(planningDb(workspace), idea.id);
    assert.equal(stored?.status, "needs_revision");
    assert.ok(stored?.summary?.includes("blocker"));
  });

  it("recordReview passed moves session to approval_ready", async () => {
    const workspace = await tmpWorkspace();
    const idea = await createIdea(workspace, "Approval ready review idea");
    const planning = await startPlanning(workspace, idea.id);
    const sessionId = planning.planningChatSession.sessionId;
    const artifact = freshArtifact(loadFixture("plan-artifact-minimal.valid.v1.json"));
    artifact.provenance = { ...artifact.provenance, sourceIdeaId: idea.id, chatSessionRef: sessionId };
    const draft = await draftPersist(workspace, artifact);
    await setDraftReady(workspace, idea.id, sessionId, draft.data.planRef, draft.data.version);
    const result = await planningModule.onCommand(
      {
        name: "review-plan-artifact",
        args: {
          planId: draft.data.planId,
          profile: "minimal",
          recordReview: true,
          expectedPlanningGeneration: draft.data.planningGeneration ?? 0,
          policyApproval: policyApproval()
        }
      },
      { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG }
    );
    assert.equal(result.ok, true);
    assert.equal(result.data.passed, true);
    assert.equal(result.data.blockerCount, 0);
    assert.equal(result.data.planningChatSession?.status, "approval_ready");
    const stored = getPlanningChatSession(planningDb(workspace), idea.id);
    assert.equal(stored?.status, "approval_ready");
    assert.equal(stored?.currentPlanVersion, result.data.version);
  });
});

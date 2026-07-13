/**
 * WP-3.4 / T100458 — draft-plan-artifact integration tests (fixtures + persist paths).
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { planningModule, taskEngineModule } from "../dist/index.js";
import { readLatestPlanArtifact } from "../dist/core/planning/plan-artifact-storage.js";
import {
  readActiveDraftPlanArtifact,
  writeActiveDraftPlanArtifact
} from "../dist/modules/planning/idea-plan/idea-planning-metadata.js";
import { getPlanningChatSession } from "../dist/modules/planning/idea-plan/planning-chat-session.js";
import { SqliteDualPlanningStore } from "../dist/modules/task-engine/persistence/sqlite-dual-planning.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturesDir = path.join(repoRoot, "fixtures", "planning");
const SQLITE_CFG = { tasks: { persistenceBackend: "sqlite" } };

function loadFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(fixturesDir, name), "utf8"));
}

function freshDraftArtifact(base) {
  const planId = crypto.randomUUID();
  const doc = structuredClone(base);
  doc.planId = planId;
  doc.planRef = `plan-artifact:${planId}`;
  doc.version = 1;
  doc.status = "draft";
  return doc;
}

async function tmpWorkspace() {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "wk-plan-draft-"));
  await mkdir(path.join(workspace, ".workspace-kit", "tasks"), { recursive: true });
  return workspace;
}

function persistArgs(artifact, extra = {}) {
  return {
    persist: true,
    artifact,
    expectedPlanningGeneration: 0,
    policyApproval: { confirmed: true, rationale: "plan-artifact-draft.test.mjs" },
    ...extra
  };
}

function policyApproval() {
  return { confirmed: true, rationale: "plan-artifact-draft.test.mjs" };
}

async function startPlanning(workspace, ideaId) {
  const started = await planningModule.onCommand(
    { name: "start-idea-planning", args: { ideaId, policyApproval: policyApproval() } },
    { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG }
  );
  assert.equal(started.ok, true);
  return started.data;
}

async function createIdea(workspace, args = {}) {
  const created = await planningModule.onCommand(
    {
      name: "create-idea",
      args: { title: "Draft link idea", policyApproval: policyApproval(), ...args }
    },
    { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG }
  );
  assert.equal(created.ok, true);
  return created.data.idea;
}

function planningDb(workspace) {
  const dual = new SqliteDualPlanningStore(workspace, ".workspace-kit/tasks/workspace-kit.db");
  dual.loadFromDisk();
  return dual.getDatabase();
}

describe("draft-plan-artifact fixtures (T100458)", () => {
  it("persists minimal valid fixture (v1)", async () => {
    const workspace = await tmpWorkspace();
    const artifact = freshDraftArtifact(loadFixture("plan-artifact-minimal.valid.v1.json"));
    const result = await planningModule.onCommand(
      { name: "draft-plan-artifact", args: persistArgs(artifact) },
      { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG }
    );
    assert.equal(result.ok, true);
    assert.equal(result.code, "plan-artifact-draft-persisted");
    assert.equal(result.data.version, 1);
    const stored = JSON.parse(
      await readFile(path.join(workspace, result.data.storagePath), "utf8")
    );
    assert.equal(stored.planId, artifact.planId);
    assert.equal(stored.identity.title, artifact.identity.title);
  });

  it("persists full-feature valid fixture (v1)", async () => {
    const workspace = await tmpWorkspace();
    const artifact = freshDraftArtifact(loadFixture("plan-artifact-full-feature.valid.v1.json"));
    const result = await planningModule.onCommand(
      { name: "draft-plan-artifact", args: persistArgs(artifact) },
      { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG }
    );
    assert.equal(result.ok, true);
    assert.equal(result.code, "plan-artifact-draft-persisted");
    assert.equal(result.data.version, 1);
    const latest = readLatestPlanArtifact(workspace, artifact.planId);
    assert.equal(latest?.version, 1);
    assert.equal(latest?.identity.planningType, "new-feature");
    assert.ok((latest?.wbs.length ?? 0) > 0);
  });

  it("rejects idea-originated draft missing sourceIdeaId", async () => {
    const workspace = await tmpWorkspace();
    const artifact = freshDraftArtifact(loadFixture("plan-artifact-minimal.valid.v1.json"));
    artifact.provenance = {
      ...artifact.provenance,
      chatSessionRef: "pcs-missing-source"
    };
    delete artifact.provenance.sourceIdeaId;

    const result = await planningModule.onCommand(
      { name: "draft-plan-artifact", args: persistArgs(artifact) },
      { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG }
    );

    assert.equal(result.ok, false);
    assert.equal(result.code, "plan-artifact-schema-invalid");
    assert.ok(
      result.data.errors?.some((error) => error.path === "provenance.sourceIdeaId")
    );
  });

  it("preserves previous plan refs across draft version updates", async () => {
    const workspace = await tmpWorkspace();
    const artifact = freshDraftArtifact(loadFixture("plan-artifact-minimal.valid.v1.json"));
    artifact.provenance = {
      ...artifact.provenance,
      chatSessionRef: "pcs-lineage-test",
      sourceIdeaId: "I100751",
      previousPlanArtifacts: ["plan-artifact:older-1"]
    };

    const first = await planningModule.onCommand(
      { name: "draft-plan-artifact", args: persistArgs(artifact) },
      { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG }
    );
    assert.equal(first.ok, true);

    const secondBody = structuredClone(artifact);
    delete secondBody.version;
    delete secondBody.provenance.previousPlanArtifacts;
    secondBody.identity = {
      ...secondBody.identity,
      summary: "Second version after edit"
    };

    const second = await planningModule.onCommand(
      {
        name: "draft-plan-artifact",
        args: persistArgs(secondBody, { expectedPlanningGeneration: first.data.planningGeneration })
      },
      { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG }
    );
    assert.equal(second.ok, true);
    const latest = readLatestPlanArtifact(workspace, artifact.planId);
    assert.equal(latest?.provenance.sourceIdeaId, "I100751");
    assert.deepEqual(latest?.provenance.previousPlanArtifacts, ["plan-artifact:older-1"]);
  });

  it("round-trips idea provenance fields", async () => {
    const workspace = await tmpWorkspace();
    const artifact = freshDraftArtifact(loadFixture("plan-artifact-minimal.valid.v1.json"));
    artifact.provenance = {
      ...artifact.provenance,
      sourceIdeaId: "I100540",
      previousPlanArtifacts: ["plan-artifact:older-1", "plan-artifact:older-2"]
    };

    const result = await planningModule.onCommand(
      { name: "draft-plan-artifact", args: persistArgs(artifact) },
      { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG }
    );

    assert.equal(result.ok, true);
    assert.equal(result.code, "plan-artifact-draft-persisted");
    const latest = readLatestPlanArtifact(workspace, artifact.planId);
    assert.equal(latest?.provenance.sourceIdeaId, "I100540");
    assert.deepEqual(latest?.provenance.previousPlanArtifacts, [
      "plan-artifact:older-1",
      "plan-artifact:older-2"
    ]);
  });

  it("rejects dedicated invalid.empty-goals fixture (B1)", async () => {
    const workspace = await tmpWorkspace();
    const artifact = loadFixture("plan-artifact-minimal.invalid.empty-goals.v1.json");
    const result = await planningModule.onCommand(
      { name: "draft-plan-artifact", args: persistArgs(artifact) },
      { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG }
    );
    assert.equal(result.ok, false);
    assert.equal(result.code, "plan-artifact-schema-invalid");
    assert.ok(result.data.errors?.length > 0);
  });

  it("bumps version on second persist for same planId", async () => {
    const workspace = await tmpWorkspace();
    const artifact = freshDraftArtifact(loadFixture("plan-artifact-minimal.valid.v1.json"));
    const first = await planningModule.onCommand(
      { name: "draft-plan-artifact", args: persistArgs(artifact) },
      { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG }
    );
    assert.equal(first.data.version, 1);

    const secondBody = structuredClone(artifact);
    delete secondBody.version;
    secondBody.identity = {
      ...secondBody.identity,
      summary: "Second version after edit"
    };

    const second = await planningModule.onCommand(
      {
        name: "draft-plan-artifact",
        args: persistArgs(secondBody, { expectedPlanningGeneration: first.data.planningGeneration })
      },
      { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG }
    );
    assert.equal(second.ok, true);
    assert.equal(second.code, "plan-artifact-draft-persisted");
    assert.equal(second.data.version, 2);
  });

  it("returns plan-artifact-version-conflict when version does not match next", async () => {
    const workspace = await tmpWorkspace();
    const artifact = freshDraftArtifact(loadFixture("plan-artifact-minimal.valid.v1.json"));
    await planningModule.onCommand(
      { name: "draft-plan-artifact", args: persistArgs(artifact) },
      { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG }
    );

    const stale = { ...artifact, version: 99 };
    const conflict = await planningModule.onCommand(
      { name: "draft-plan-artifact", args: persistArgs(stale) },
      { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG }
    );
    assert.equal(conflict.ok, false);
    assert.equal(conflict.code, "plan-artifact-version-conflict");
  });

  it("idempotent replay with clientMutationId", async () => {
    const workspace = await tmpWorkspace();
    const artifact = freshDraftArtifact(loadFixture("plan-artifact-minimal.valid.v1.json"));
    const mutationId = `draft-test-${crypto.randomUUID()}`;
    const args = persistArgs(artifact, { clientMutationId: mutationId });

    const first = await planningModule.onCommand(
      { name: "draft-plan-artifact", args },
      { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG }
    );
    assert.equal(first.code, "plan-artifact-draft-persisted");

    const replay = await planningModule.onCommand(
      {
        name: "draft-plan-artifact",
        args: persistArgs(artifact, {
          clientMutationId: mutationId,
          expectedPlanningGeneration: first.data.planningGeneration
        })
      },
      { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG }
    );
    assert.equal(replay.ok, true);
    assert.equal(replay.code, "plan-artifact-draft-idempotent-replay");
    assert.equal(replay.data.replayed, true);
    assert.equal(replay.data.version, first.data.version);
    assert.equal(replay.data.planId, first.data.planId);
  });

  it("links idea-originated draft as activeDraftPlanArtifact without touching linkedPlanArtifact", async () => {
    const workspace = await tmpWorkspace();
    const idea = await createIdea(workspace, {
      title: "First draft idea",
      linkedPlanArtifact: "plan-artifact:accepted-plan",
      previousPlanArtifacts: ["plan-artifact:older-plan"]
    });
    const artifact = freshDraftArtifact(loadFixture("plan-artifact-minimal.valid.v1.json"));
    artifact.provenance = {
      ...artifact.provenance,
      sourceIdeaId: idea.id,
      chatSessionRef: "pcs-first-draft"
    };

    const result = await planningModule.onCommand(
      { name: "draft-plan-artifact", args: persistArgs(artifact) },
      { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG }
    );
    assert.equal(result.ok, true);

    const db = planningDb(workspace);
    assert.equal(readActiveDraftPlanArtifact(db, idea.id), result.data.planRef);

    const retrieved = await planningModule.onCommand(
      { name: "get-idea", args: { ideaId: idea.id } },
      { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG }
    );
    assert.equal(retrieved.data.idea.linkedPlanArtifact, "plan-artifact:accepted-plan");
    assert.deepEqual(retrieved.data.idea.previousPlanArtifacts, ["plan-artifact:older-plan"]);
  });

  it("updates activeDraftPlanArtifact on replan while preserving accepted linked plan", async () => {
    const workspace = await tmpWorkspace();
    const idea = await createIdea(workspace, {
      title: "Replan idea",
      linkedPlanArtifact: "plan-artifact:accepted-plan"
    });
    const db = planningDb(workspace);
    writeActiveDraftPlanArtifact(db, idea.id, "plan-artifact:old-draft", new Date().toISOString());

    const artifact = freshDraftArtifact(loadFixture("plan-artifact-minimal.valid.v1.json"));
    artifact.provenance = {
      ...artifact.provenance,
      sourceIdeaId: idea.id,
      chatSessionRef: "pcs-replan"
    };

    const result = await planningModule.onCommand(
      { name: "draft-plan-artifact", args: persistArgs(artifact) },
      { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG }
    );
    assert.equal(result.ok, true);
    assert.equal(readActiveDraftPlanArtifact(db, idea.id), result.data.planRef);
    assert.notEqual(readActiveDraftPlanArtifact(db, idea.id), "plan-artifact:old-draft");

    const retrieved = await planningModule.onCommand(
      { name: "get-idea", args: { ideaId: idea.id } },
      { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG }
    );
    assert.equal(retrieved.data.idea.linkedPlanArtifact, "plan-artifact:accepted-plan");
  });

  it("moves planning session to draft_ready after idea-originated draft persist (T100753)", async () => {
    const workspace = await tmpWorkspace();
    const idea = await createIdea(workspace, { title: "Draft ready idea" });
    const planning = await startPlanning(workspace, idea.id);
    const sessionId = planning.planningChatSession.sessionId;
    const artifact = freshDraftArtifact(loadFixture("plan-artifact-minimal.valid.v1.json"));
    artifact.provenance = { ...artifact.provenance, sourceIdeaId: idea.id, chatSessionRef: sessionId };
    const result = await planningModule.onCommand(
      { name: "draft-plan-artifact", args: persistArgs(artifact) },
      { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG }
    );
    assert.equal(result.ok, true);
    assert.equal(result.data.planningChatSession?.status, "draft_ready");
    assert.equal(result.data.planningChatSession?.currentPlanRef, result.data.planRef);
    assert.equal(result.data.planningChatSession?.currentPlanVersion, result.data.version);
    assert.equal(result.data.planningChatSession?.completedAt, undefined);
    const stored = getPlanningChatSession(planningDb(workspace), idea.id);
    assert.equal(stored?.status, "draft_ready");
    assert.equal(stored?.currentPlanRef, result.data.planRef);
    assert.equal(stored?.currentPlanVersion, result.data.version);
    assert.equal(stored?.completedAt, undefined);
  });

  it("dashboard ideas slice exposes draft_ready session for resume (T100753)", async () => {
    const workspace = await tmpWorkspace();
    const idea = await createIdea(workspace, { title: "Dashboard draft ready", status: "planning" });
    const planning = await startPlanning(workspace, idea.id);
    const sessionId = planning.planningChatSession.sessionId;
    const artifact = freshDraftArtifact(loadFixture("plan-artifact-minimal.valid.v1.json"));
    artifact.provenance = { ...artifact.provenance, sourceIdeaId: idea.id, chatSessionRef: sessionId };
    const persisted = await planningModule.onCommand(
      { name: "draft-plan-artifact", args: persistArgs(artifact) },
      { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG }
    );
    assert.equal(persisted.ok, true);
    const summary = await taskEngineModule.onCommand(
      { name: "dashboard-summary", args: {} },
      { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG }
    );
    assert.equal(summary.ok, true);
    const row = summary.data.ideas.top.find((entry) => entry.id === idea.id);
    assert.ok(row?.planningChatSession);
    assert.equal(row.planningChatSession.status, "draft_ready");
    assert.equal(row.planningChatSession.currentPlanRef, persisted.data.planRef);
    assert.equal(row.planningChatSession.currentPlanVersion, persisted.data.version);
    assert.equal(row.planningChatSession.completedAt, undefined);
  });

  it("does not promote session when chatSessionRef mismatches active session", async () => {
    const workspace = await tmpWorkspace();
    const idea = await createIdea(workspace, { title: "Mismatch session idea" });
    await startPlanning(workspace, idea.id);
    const artifact = freshDraftArtifact(loadFixture("plan-artifact-minimal.valid.v1.json"));
    artifact.provenance = { ...artifact.provenance, sourceIdeaId: idea.id, chatSessionRef: "pcs-wrong-session" };
    const result = await planningModule.onCommand(
      { name: "draft-plan-artifact", args: persistArgs(artifact) },
      { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG }
    );
    assert.equal(result.ok, true);
    assert.equal(result.data.planningChatSession, undefined);
    assert.equal(getPlanningChatSession(planningDb(workspace), idea.id)?.status, "active");
  });
});

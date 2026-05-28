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

import { planningModule } from "../dist/index.js";
import { readLatestPlanArtifact } from "../dist/core/planning/plan-artifact-storage.js";

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
});

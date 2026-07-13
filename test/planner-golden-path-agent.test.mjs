/**
 * T100864 — merge contract gate: CLI golden-path harness on dual-registration shim (T100863).
 * Re-run mandatory after WBS-7 (T100822 list-ideas MCP) and WBS-10 (T100825 finalize-preview-packet MCP).
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import { mkdir, mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { runCli } from "../dist/cli.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturesDir = path.join(repoRoot, "fixtures", "planning");
const ideasFixturesDir = path.join(repoRoot, "fixtures", "ideas");
const firstRunFixture = JSON.parse(
  fs.readFileSync(path.join(ideasFixturesDir, "empty-inventory-first-run.fixture.json"), "utf8")
);

/** Frozen CLI command success codes exercised by the golden-path harness. */
const FROZEN_GOLDEN_PATH_CODES = {
  "get-planner-flow-status": "planner-flow-status",
  "list-ideas": "ideas-listed",
  "draft-plan-artifact": "plan-artifact-draft-persisted",
  "review-plan-artifact": "plan-artifact-review-complete",
  "accept-plan-artifact": "plan-artifact-accepted",
  "finalize-plan-to-phase": "plan-artifact-finalize-preview"
};

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

function loadFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(fixturesDir, name), "utf8"));
}

function freshArtifact(base) {
  const planId = crypto.randomUUID();
  const artifact = structuredClone(base);
  artifact.planId = planId;
  artifact.planRef = `plan-artifact:${planId}`;
  artifact.version = 1;
  artifact.status = "draft";
  artifact.provenance = {
    ...(artifact.provenance ?? {}),
    source: "planner-chat",
    sourceIdeaId: "I900"
  };
  return artifact;
}

function approvalFor(artifact, version) {
  return {
    schemaVersion: 1,
    confirmed: true,
    approvedVersion: version,
    approvedAt: "2026-07-09T08:00:00.000Z",
    approvedBy: "golden-path-agent@test",
    planRef: artifact.planRef
  };
}

function enrichWbsForBatchReview(artifact) {
  const tail = "rollback activation toggle empty first-run unit test verification coverage";
  for (const row of artifact.wbs) {
    row.generatedTaskPayload.technicalScope.push(tail);
    row.generatedTaskPayload.acceptanceCriteria.push(
      "Observable verification with rollback and empty first-run behavior"
    );
  }
}

async function tmpWorkspace() {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "wk-planner-golden-path-"));
  await mkdir(path.join(workspace, ".workspace-kit", "tasks"), { recursive: true });
  return workspace;
}

async function runWk(workspace, command, args, expectedExitCode = 0) {
  const capture = createCapture();
  const exitCode = await runCli(["run", command, JSON.stringify(args)], { cwd: workspace, ...capture });
  assert.equal(
    exitCode,
    expectedExitCode,
    [...capture.errors, ...capture.lines].join("\n")
  );
  assert.ok(capture.lines.length > 0, `expected ${command} to emit JSON`);
  return JSON.parse(capture.lines.at(-1));
}

describe("Planner golden-path agent harness (T100864 merge contract gate)", () => {
  it("fresh workspace: list-ideas returns frozen empty-inventory contract", async () => {
    const workspace = await tmpWorkspace();
    const listed = await runWk(workspace, "list-ideas", {});

    assert.equal(listed.ok, true, listed.message);
    assert.equal(listed.code, FROZEN_GOLDEN_PATH_CODES["list-ideas"]);
    assert.equal(listed.code, firstRunFixture.listIdeas.code);
    assert.equal(listed.data.count, firstRunFixture.listIdeas.emptyInventory.count);
    assert.deepEqual(listed.data.ideas, firstRunFixture.listIdeas.emptyInventory.ideas);
  });

  it("empty workspace: get-planner-flow-status then PlanArtifact chain through finalize dryRun", async () => {
    const workspace = await tmpWorkspace();

    const flow = await runWk(workspace, "get-planner-flow-status", {});
    assert.equal(flow.ok, true, flow.message);
    assert.equal(flow.code, FROZEN_GOLDEN_PATH_CODES["get-planner-flow-status"]);
    assert.equal(flow.data.goldenPathStage, firstRunFixture.plannerFlowStatus.firstRun.goldenPathStage);
    assert.equal(flow.data.ideaCount, firstRunFixture.plannerFlowStatus.firstRun.ideaCount);
    assert.ok(flow.data.recommendedNextCommand, "flow status recommends next command");
    assert.ok(
      ["create-idea", "start-idea-planning", "list-ideas", "planner-chat"].some((cmd) =>
        String(flow.data.recommendedNextCommand?.command ?? "").includes(cmd)
      ),
      `unexpected next command: ${flow.data.recommendedNextCommand?.command}`
    );

    const artifact = freshArtifact(loadFixture("plan-artifact-full-feature.valid.v1.json"));
    artifact.openQuestions = [];
    enrichWbsForBatchReview(artifact);

    const draft = await runWk(workspace, "draft-plan-artifact", {
      persist: true,
      artifact,
      ideaId: "I900",
      expectedPlanningGeneration: flow.data.planningGeneration ?? 0,
      policyApproval: { confirmed: true, rationale: "planner golden-path draft" }
    });
    assert.equal(draft.ok, true, draft.message);
    assert.equal(draft.code, FROZEN_GOLDEN_PATH_CODES["draft-plan-artifact"]);

    const review = await runWk(workspace, "review-plan-artifact", {
      planId: draft.data.planId,
      profile: "minimal",
      recordReview: true,
      expectedPlanningGeneration: draft.data.planningGeneration,
      policyApproval: { confirmed: true, rationale: "planner golden-path review" }
    });
    assert.equal(review.ok, true, review.message);
    assert.equal(review.code, FROZEN_GOLDEN_PATH_CODES["review-plan-artifact"]);
    assert.equal(review.data.passed, true);

    const accepted = await runWk(workspace, "accept-plan-artifact", {
      planId: draft.data.planId,
      approvalRecord: approvalFor(artifact, review.data.version),
      expectedPlanningGeneration: review.data.planningGeneration,
      policyApproval: { confirmed: true, rationale: "planner golden-path accept" }
    });
    assert.equal(accepted.ok, true, accepted.message);
    assert.equal(accepted.code, FROZEN_GOLDEN_PATH_CODES["accept-plan-artifact"]);

    const preview = await runWk(workspace, "finalize-plan-to-phase", {
      planId: draft.data.planId,
      dryRun: true,
      targetPhaseKey: "144",
      targetPhase: "Phase 144",
      desiredStatus: "ready"
    });
    assert.equal(preview.ok, true, preview.message);
    assert.equal(preview.code, FROZEN_GOLDEN_PATH_CODES["finalize-plan-to-phase"]);
    assert.ok(preview.data.taskPreview.length > 0);

    const packet = await runWk(workspace, "get-plan-artifact", { planId: draft.data.planId });
    assert.equal(packet.ok, true, packet.message);
    assert.equal(packet.data.artifact.status, "accepted");
  });
});

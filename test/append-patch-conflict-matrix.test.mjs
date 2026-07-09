/** T100835 — append-wbs-row vs patch-plan-artifact conflict and concurrency matrix. */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { ideasModule, planningModule } from "../dist/index.js";
import { getPlanArtifactStoragePaths } from "../dist/core/planning/plan-artifact-storage.js";
import { readIdeaPlanArtifact } from "../dist/modules/ideas/idea-plan-artifact-storage.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturesDir = path.join(repoRoot, "fixtures", "planning");
const ideasFixturesDir = path.join(repoRoot, "fixtures", "ideas");
const SQLITE_CFG = { tasks: { persistenceBackend: "sqlite" } };

function loadFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(fixturesDir, name), "utf8"));
}

function loadIdeaFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(ideasFixturesDir, name), "utf8"));
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
  const workspace = await mkdtemp(path.join(os.tmpdir(), "wk-append-patch-conflict-"));
  await mkdir(path.join(workspace, ".workspace-kit", "tasks"), { recursive: true });
  return workspace;
}

function ctx(workspace) {
  return { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG };
}

function policyApproval() {
  return { confirmed: true, rationale: "append-patch-conflict-matrix.test.mjs" };
}

async function planningGeneration(workspace) {
  return (await ideasModule.onCommand({ name: "list-ideas", args: {} }, ctx(workspace))).data.planningGeneration;
}

async function createIdeaWithUnifiedPlan(workspace, fixtureName, title = "Append/patch conflict idea") {
  const fixtureTemplate = loadIdeaFixture(fixtureName);
  const created = await ideasModule.onCommand(
    {
      name: "create-idea",
      args: {
        title,
        linkedPlanArtifact: fixtureTemplate.planRef,
        policyApproval: policyApproval()
      }
    },
    ctx(workspace)
  );
  assert.equal(created.ok, true);
  const fixture = { ...fixtureTemplate, ideaId: created.data.idea.id };
  const paths = getPlanArtifactStoragePaths(workspace, fixture.planId);
  await mkdir(paths.planDirAbsolute, { recursive: true });
  await writeFile(paths.artifactFileAbsolute(fixture.version), `${JSON.stringify(fixture, null, 2)}\n`, "utf8");
  return { idea: created.data.idea, fixture };
}

function sampleWbsRow(wbsId, title) {
  return {
    wbsId,
    title,
    goalMapping: ["PlanArtifact v1 validates in CI"],
    suggestedTaskTitle: title,
    approach: "Implement incrementally via append-wbs-row",
    technicalScope: ["src/modules/planning"],
    acceptanceCriteria: ["Row persists on unified IdeaPlan draft"],
    testingVerification: ["test/append-patch-conflict-matrix.test.mjs"],
    dependsOn: [],
    sizingConfidence: "medium",
    doneMeans: `${title} is complete when acceptance criteria pass`,
    generatedTaskPayload: {
      title,
      approach: "Implement incrementally via append-wbs-row",
      technicalScope: ["src/modules/planning"],
      acceptanceCriteria: ["Row persists on unified IdeaPlan draft"]
    }
  };
}

async function seedPlanningDraft(workspace, idea, fixture) {
  const generation = await planningGeneration(workspace);
  const started = await ideasModule.onCommand(
    {
      name: "start-idea-planning",
      args: {
        ideaId: idea.id,
        expectedPlanningGeneration: generation,
        policyApproval: policyApproval()
      }
    },
    ctx(workspace)
  );
  assert.equal(started.ok, true);

  const artifact = freshDraftArtifact(loadFixture("plan-artifact-minimal.valid.v1.json"));
  artifact.provenance = {
    ...artifact.provenance,
    sourceIdeaId: idea.id,
    chatSessionRef: started.data.planningChatSession.sessionId
  };

  const afterStartGen = await planningGeneration(workspace);
  const drafted = await planningModule.onCommand(
    {
      name: "draft-plan-artifact",
      args: {
        persist: true,
        artifact,
        expectedPlanningGeneration: afterStartGen,
        policyApproval: policyApproval()
      }
    },
    ctx(workspace)
  );
  assert.equal(drafted.ok, true);
  return { planRef: fixture.planRef, initialWbsCount: artifact.wbs.length };
}

async function appendWbsRow(workspace, planRef, wbsRow, extra = {}) {
  const generation = await planningGeneration(workspace);
  return planningModule.onCommand(
    {
      name: "append-wbs-row",
      args: {
        planRef,
        wbsRow,
        expectedPlanningGeneration: generation,
        policyApproval: policyApproval(),
        ...extra
      }
    },
    ctx(workspace)
  );
}

async function patchPlanArtifact(workspace, planRef, section, patch, extra = {}) {
  const generation = await planningGeneration(workspace);
  return planningModule.onCommand(
    {
      name: "patch-plan-artifact",
      args: {
        planRef,
        section,
        patch,
        expectedPlanningGeneration: generation,
        policyApproval: policyApproval(),
        ...extra
      }
    },
    ctx(workspace)
  );
}

describe("append/patch conflict matrix (T100835)", () => {
  it("append-wbs-row rejects stale expectedPlanningGeneration", async () => {
    const workspace = await tmpWorkspace();
    const { idea, fixture } = await createIdeaWithUnifiedPlan(workspace, "planning-state.fixture.json");
    const { planRef } = await seedPlanningDraft(workspace, idea, fixture);

    const staleGen = await planningGeneration(workspace);
    await appendWbsRow(workspace, planRef, sampleWbsRow("WBS-2", "First append"));

    const mismatch = await planningModule.onCommand(
      {
        name: "append-wbs-row",
        args: {
          planRef,
          wbsRow: sampleWbsRow("WBS-3", "Stale generation append"),
          expectedPlanningGeneration: staleGen,
          policyApproval: policyApproval()
        }
      },
      ctx(workspace)
    );

    assert.equal(mismatch.ok, false);
    assert.equal(mismatch.code, "planning-generation-mismatch");
    assert.ok(typeof mismatch.data?.currentPlanningGeneration === "number");
    assert.ok(mismatch.data.currentPlanningGeneration > staleGen);

    const stored = readIdeaPlanArtifact(workspace, planRef);
    assert.equal(stored.wbs?.some((row) => row.wbsId === "WBS-3"), false);
  });

  it("patch-plan-artifact rejects stale expectedPlanningGeneration", async () => {
    const workspace = await tmpWorkspace();
    const { idea, fixture } = await createIdeaWithUnifiedPlan(workspace, "planning-state.fixture.json");
    const { planRef } = await seedPlanningDraft(workspace, idea, fixture);

    const staleGen = await planningGeneration(workspace);
    await patchPlanArtifact(workspace, planRef, "identity", { title: "First patch title" });

    const mismatch = await planningModule.onCommand(
      {
        name: "patch-plan-artifact",
        args: {
          planRef,
          section: "identity",
          patch: { title: "Stale generation patch" },
          expectedPlanningGeneration: staleGen,
          policyApproval: policyApproval()
        }
      },
      ctx(workspace)
    );

    assert.equal(mismatch.ok, false);
    assert.equal(mismatch.code, "planning-generation-mismatch");

    const stored = readIdeaPlanArtifact(workspace, planRef);
    assert.equal(stored.identity?.title, "First patch title");
  });

  it("append then patch with fresh generations preserve both mutations", async () => {
    const workspace = await tmpWorkspace();
    const { idea, fixture } = await createIdeaWithUnifiedPlan(workspace, "planning-state.fixture.json");
    const { planRef, initialWbsCount } = await seedPlanningDraft(workspace, idea, fixture);

    const appended = await appendWbsRow(workspace, planRef, sampleWbsRow("WBS-2", "Appended row"));
    assert.equal(appended.ok, true);
    assert.equal(appended.code, "append-wbs-row-persisted");

    const patched = await patchPlanArtifact(workspace, planRef, "identity", { title: "Cross-command title" });
    assert.equal(patched.ok, true);
    assert.equal(patched.code, "patch-plan-artifact-persisted");

    const stored = readIdeaPlanArtifact(workspace, planRef);
    assert.equal(stored.identity?.title, "Cross-command title");
    assert.equal(stored.wbs?.length, initialWbsCount + 1);
    assert.equal(stored.wbs?.find((row) => row.wbsId === "WBS-2")?.title, "Appended row");
  });

  it("patch then append with stale generation rejects append without losing patch", async () => {
    const workspace = await tmpWorkspace();
    const { idea, fixture } = await createIdeaWithUnifiedPlan(workspace, "planning-state.fixture.json");
    const { planRef, initialWbsCount } = await seedPlanningDraft(workspace, idea, fixture);

    const staleGen = await planningGeneration(workspace);
    const patched = await patchPlanArtifact(workspace, planRef, "goals", ["Patched goal A", "Patched goal B"]);
    assert.equal(patched.ok, true);

    const mismatch = await planningModule.onCommand(
      {
        name: "append-wbs-row",
        args: {
          planRef,
          wbsRow: sampleWbsRow("WBS-2", "Should not land"),
          expectedPlanningGeneration: staleGen,
          policyApproval: policyApproval()
        }
      },
      ctx(workspace)
    );

    assert.equal(mismatch.ok, false);
    assert.equal(mismatch.code, "planning-generation-mismatch");

    const stored = readIdeaPlanArtifact(workspace, planRef);
    assert.deepEqual(stored.goals, ["Patched goal A", "Patched goal B"]);
    assert.equal(stored.wbs?.length, initialWbsCount);
  });

  it("rejects duplicate wbsId on append without mutating stored draft", async () => {
    const workspace = await tmpWorkspace();
    const { idea, fixture } = await createIdeaWithUnifiedPlan(workspace, "planning-state.fixture.json");
    const { planRef, initialWbsCount } = await seedPlanningDraft(workspace, idea, fixture);

    const conflict = await appendWbsRow(workspace, planRef, sampleWbsRow("WBS-1", "Duplicate id row"));
    assert.equal(conflict.ok, false);
    assert.equal(conflict.code, "wbs-id-conflict");

    const stored = readIdeaPlanArtifact(workspace, planRef);
    assert.equal(stored.wbs?.length, initialWbsCount);
    assert.equal(stored.wbs?.find((row) => row.wbsId === "WBS-1")?.title, "Add JSON Schema");
  });

  it("overlapping identity patches reject stale generation on second write", async () => {
    const workspace = await tmpWorkspace();
    const { idea, fixture } = await createIdeaWithUnifiedPlan(workspace, "planning-state.fixture.json");
    const { planRef } = await seedPlanningDraft(workspace, idea, fixture);

    const staleGen = await planningGeneration(workspace);
    const first = await patchPlanArtifact(workspace, planRef, "identity", { title: "Overlapping patch one" });
    assert.equal(first.ok, true);

    const second = await planningModule.onCommand(
      {
        name: "patch-plan-artifact",
        args: {
          planRef,
          section: "identity",
          patch: { title: "Overlapping patch two" },
          expectedPlanningGeneration: staleGen,
          policyApproval: policyApproval()
        }
      },
      ctx(workspace)
    );

    assert.equal(second.ok, false);
    assert.equal(second.code, "planning-generation-mismatch");

    const stored = readIdeaPlanArtifact(workspace, planRef);
    assert.equal(stored.identity?.title, "Overlapping patch one");
  });

  it("overlapping wbs row patches reject stale generation on second write", async () => {
    const workspace = await tmpWorkspace();
    const { idea, fixture } = await createIdeaWithUnifiedPlan(workspace, "planning-state.fixture.json");
    const { planRef } = await seedPlanningDraft(workspace, idea, fixture);

    const staleGen = await planningGeneration(workspace);
    const first = await patchPlanArtifact(
      workspace,
      planRef,
      "wbs",
      { title: "First WBS patch" },
      { wbsId: "WBS-1" }
    );
    assert.equal(first.ok, true);

    const second = await planningModule.onCommand(
      {
        name: "patch-plan-artifact",
        args: {
          planRef,
          section: "wbs",
          wbsId: "WBS-1",
          patch: { title: "Second WBS patch should not land" },
          expectedPlanningGeneration: staleGen,
          policyApproval: policyApproval()
        }
      },
      ctx(workspace)
    );

    assert.equal(second.ok, false);
    assert.equal(second.code, "planning-generation-mismatch");

    const stored = readIdeaPlanArtifact(workspace, planRef);
    assert.equal(stored.wbs?.find((row) => row.wbsId === "WBS-1")?.title, "First WBS patch");
  });

  it("append-wbs-row retry with same clientMutationId rejects duplicate wbsId without double-append", async () => {
    const workspace = await tmpWorkspace();
    const { idea, fixture } = await createIdeaWithUnifiedPlan(workspace, "planning-state.fixture.json");
    const { planRef, initialWbsCount } = await seedPlanningDraft(workspace, idea, fixture);

    const mutationId = `append-conflict-${crypto.randomUUID()}`;
    const row = sampleWbsRow("WBS-2", "Retry-safe append row");
    const first = await appendWbsRow(workspace, planRef, row, { clientMutationId: mutationId });
    assert.equal(first.ok, true);
    assert.equal(first.code, "append-wbs-row-persisted");

    const retry = await appendWbsRow(workspace, planRef, row, { clientMutationId: mutationId });
    assert.equal(retry.ok, false);
    assert.equal(retry.code, "wbs-id-conflict");

    const stored = readIdeaPlanArtifact(workspace, planRef);
    assert.equal(stored.wbs?.length, initialWbsCount + 1);
    assert.equal(stored.wbs?.filter((entry) => entry.wbsId === "WBS-2").length, 1);
  });

  it("patch-plan-artifact retry with same clientMutationId rejects digest drift without double-write", async () => {
    const workspace = await tmpWorkspace();
    const { idea, fixture } = await createIdeaWithUnifiedPlan(workspace, "planning-state.fixture.json");
    const { planRef } = await seedPlanningDraft(workspace, idea, fixture);

    const mutationId = `patch-conflict-${crypto.randomUUID()}`;
    const first = await patchPlanArtifact(
      workspace,
      planRef,
      "identity",
      { title: "Retry-safe patch title" },
      { clientMutationId: mutationId }
    );
    assert.equal(first.ok, true);
    assert.equal(first.code, "patch-plan-artifact-persisted");

    const retry = await patchPlanArtifact(
      workspace,
      planRef,
      "identity",
      { title: "Retry-safe patch title" },
      { clientMutationId: mutationId }
    );
    assert.equal(retry.ok, false);
    assert.equal(retry.code, "idempotency-key-conflict");

    const stored = readIdeaPlanArtifact(workspace, planRef);
    assert.equal(stored.identity?.title, "Retry-safe patch title");
  });

  it("append-wbs-row rejects idempotency-key-conflict for reused clientMutationId with different payload", async () => {
    const workspace = await tmpWorkspace();
    const { idea, fixture } = await createIdeaWithUnifiedPlan(workspace, "planning-state.fixture.json");
    const { planRef, initialWbsCount } = await seedPlanningDraft(workspace, idea, fixture);

    const mutationId = `append-shared-${crypto.randomUUID()}`;
    const first = await appendWbsRow(workspace, planRef, sampleWbsRow("WBS-2", "First idempotent row"), {
      clientMutationId: mutationId
    });
    assert.equal(first.ok, true);

    const conflict = await appendWbsRow(workspace, planRef, sampleWbsRow("WBS-3", "Different payload row"), {
      clientMutationId: mutationId
    });
    assert.equal(conflict.ok, false);
    assert.equal(conflict.code, "idempotency-key-conflict");

    const stored = readIdeaPlanArtifact(workspace, planRef);
    assert.equal(stored.wbs?.length, initialWbsCount + 1);
    assert.equal(stored.wbs?.some((row) => row.wbsId === "WBS-3"), false);
  });

  it("patch-plan-artifact rejects idempotency-key-conflict for reused clientMutationId with different payload", async () => {
    const workspace = await tmpWorkspace();
    const { idea, fixture } = await createIdeaWithUnifiedPlan(workspace, "planning-state.fixture.json");
    const { planRef } = await seedPlanningDraft(workspace, idea, fixture);

    const mutationId = `patch-shared-${crypto.randomUUID()}`;
    const first = await patchPlanArtifact(
      workspace,
      planRef,
      "identity",
      { title: "First idempotent patch" },
      { clientMutationId: mutationId }
    );
    assert.equal(first.ok, true);

    const conflict = await patchPlanArtifact(
      workspace,
      planRef,
      "identity",
      { title: "Different idempotent patch" },
      { clientMutationId: mutationId }
    );
    assert.equal(conflict.ok, false);
    assert.equal(conflict.code, "idempotency-key-conflict");

    const stored = readIdeaPlanArtifact(workspace, planRef);
    assert.equal(stored.identity?.title, "First idempotent patch");
  });

  it("append then patch same WBS row with fresh generations", async () => {
    const workspace = await tmpWorkspace();
    const { idea, fixture } = await createIdeaWithUnifiedPlan(workspace, "planning-state.fixture.json");
    const { planRef } = await seedPlanningDraft(workspace, idea, fixture);

    const appended = await appendWbsRow(workspace, planRef, sampleWbsRow("WBS-2", "Row to patch"));
    assert.equal(appended.ok, true);
    assert.equal(appended.code, "append-wbs-row-persisted");

    const patched = await patchPlanArtifact(
      workspace,
      planRef,
      "wbs",
      { title: "Patched appended row title" },
      { wbsId: "WBS-2" }
    );
    assert.equal(patched.ok, true);
    assert.equal(patched.code, "patch-plan-artifact-persisted");
    assert.equal(patched.data.patchedWbsId, "WBS-2");

    const stored = readIdeaPlanArtifact(workspace, planRef);
    assert.equal(stored.wbs?.find((row) => row.wbsId === "WBS-2")?.title, "Patched appended row title");
  });
});

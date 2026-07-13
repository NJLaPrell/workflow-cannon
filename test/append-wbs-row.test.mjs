/** T100818 — append-wbs-row Tier B mutation on unified IdeaPlan drafts. */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { planningModule } from "../dist/index.js";
import { getPlanArtifactStoragePaths } from "../dist/core/planning/plan-artifact-storage.js";
import { readIdeaPlanArtifact } from "../dist/modules/planning/idea-plan/idea-plan-artifact-storage.js";

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
  const workspace = await mkdtemp(path.join(os.tmpdir(), "wk-append-wbs-row-"));
  await mkdir(path.join(workspace, ".workspace-kit", "tasks"), { recursive: true });
  return workspace;
}

function ctx(workspace) {
  return { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG };
}

function policyApproval() {
  return { confirmed: true, rationale: "append-wbs-row.test.mjs" };
}

async function planningGeneration(workspace) {
  return (await planningModule.onCommand({ name: "list-ideas", args: {} }, ctx(workspace))).data.planningGeneration;
}

async function createIdeaWithUnifiedPlan(workspace, fixtureName, title = "Append WBS row idea") {
  const fixtureTemplate = loadIdeaFixture(fixtureName);
  const created = await planningModule.onCommand(
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
    testingVerification: ["test/append-wbs-row.test.mjs"],
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
  const started = await planningModule.onCommand(
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

describe("append-wbs-row (T100818)", () => {
  it("appends one WBS row to unified IdeaPlan planning draft", async () => {
    const workspace = await tmpWorkspace();
    const { idea, fixture } = await createIdeaWithUnifiedPlan(workspace, "planning-state.fixture.json");
    const { planRef, initialWbsCount } = await seedPlanningDraft(workspace, idea, fixture);

    const generation = await planningGeneration(workspace);
    const appended = await planningModule.onCommand(
      {
        name: "append-wbs-row",
        args: {
          planRef,
          wbsRow: sampleWbsRow("WBS-2", "Second incremental WBS row"),
          expectedPlanningGeneration: generation,
          policyApproval: policyApproval()
        }
      },
      ctx(workspace)
    );

    assert.equal(appended.ok, true);
    assert.equal(appended.code, "append-wbs-row-persisted");
    assert.equal(appended.data.appendedWbsId, "WBS-2");
    assert.equal(appended.data.wbsRowCount, initialWbsCount + 1);

    const stored = readIdeaPlanArtifact(workspace, planRef);
    assert.ok(stored);
    assert.equal(stored.status, "planning");
    assert.equal(stored.wbs?.length, initialWbsCount + 1);
    assert.equal(stored.plan?.wbsRowCount, initialWbsCount + 1);
    assert.equal(stored.wbs?.some((row) => row.wbsId === "WBS-2"), true);
    assert.equal(stored.wbs?.find((row) => row.wbsId === "WBS-2")?.title, "Second incremental WBS row");
  });

  it("rejects structurally invalid WBS rows before persistence", async () => {
    const workspace = await tmpWorkspace();
    const { idea, fixture } = await createIdeaWithUnifiedPlan(workspace, "planning-state.fixture.json");
    const { planRef } = await seedPlanningDraft(workspace, idea, fixture);

    const generation = await planningGeneration(workspace);
    const result = await planningModule.onCommand(
      {
        name: "append-wbs-row",
        args: {
          planRef,
          wbsRow: { wbsId: "WBS-bad", title: "Missing required WBS fields" },
          expectedPlanningGeneration: generation,
          policyApproval: policyApproval()
        }
      },
      ctx(workspace)
    );

    assert.equal(result.ok, false);
    assert.equal(result.code, "wbs-shape-invalid");
    assert.ok(Array.isArray(result.data.findings) && result.data.findings.length > 0);
  });

  it("rejects duplicate wbsId on the same plan", async () => {
    const workspace = await tmpWorkspace();
    const { idea, fixture } = await createIdeaWithUnifiedPlan(workspace, "planning-state.fixture.json");
    const { planRef } = await seedPlanningDraft(workspace, idea, fixture);

    const generation = await planningGeneration(workspace);
    const duplicate = await planningModule.onCommand(
      {
        name: "append-wbs-row",
        args: {
          planRef,
          wbsRow: sampleWbsRow("WBS-1", "Duplicate id row"),
          expectedPlanningGeneration: generation,
          policyApproval: policyApproval()
        }
      },
      ctx(workspace)
    );

    assert.equal(duplicate.ok, false);
    assert.equal(duplicate.code, "wbs-id-conflict");
  });
});

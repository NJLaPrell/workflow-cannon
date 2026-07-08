/** T100819 — patch-plan-artifact Tier B mutation on unified IdeaPlan drafts. */
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
  const workspace = await mkdtemp(path.join(os.tmpdir(), "wk-patch-plan-artifact-"));
  await mkdir(path.join(workspace, ".workspace-kit", "tasks"), { recursive: true });
  return workspace;
}

function ctx(workspace) {
  return { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG };
}

function policyApproval() {
  return { confirmed: true, rationale: "patch-plan-artifact.test.mjs" };
}

async function planningGeneration(workspace) {
  return (await ideasModule.onCommand({ name: "list-ideas", args: {} }, ctx(workspace))).data.planningGeneration;
}

async function createIdeaWithUnifiedPlan(workspace, fixtureName, title = "Patch plan artifact idea") {
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
  return { planRef: fixture.planRef, artifact };
}

describe("patch-plan-artifact (T100819)", () => {
  it("patches identity title on unified IdeaPlan planning draft", async () => {
    const workspace = await tmpWorkspace();
    const { idea, fixture } = await createIdeaWithUnifiedPlan(workspace, "planning-state.fixture.json");
    const { planRef } = await seedPlanningDraft(workspace, idea, fixture);

    const generation = await planningGeneration(workspace);
    const patched = await planningModule.onCommand(
      {
        name: "patch-plan-artifact",
        args: {
          planRef,
          section: "identity",
          patch: { title: "Patched identity title" },
          expectedPlanningGeneration: generation,
          policyApproval: policyApproval()
        }
      },
      ctx(workspace)
    );

    assert.equal(patched.ok, true);
    assert.equal(patched.code, "patch-plan-artifact-persisted");
    assert.equal(patched.data.patchedSection, "identity");

    const stored = readIdeaPlanArtifact(workspace, planRef);
    assert.ok(stored);
    assert.equal(stored.identity?.title, "Patched identity title");
  });

  it("replaces goals array via section patch", async () => {
    const workspace = await tmpWorkspace();
    const { idea, fixture } = await createIdeaWithUnifiedPlan(workspace, "planning-state.fixture.json");
    const { planRef } = await seedPlanningDraft(workspace, idea, fixture);

    const generation = await planningGeneration(workspace);
    const patched = await planningModule.onCommand(
      {
        name: "patch-plan-artifact",
        args: {
          planRef,
          section: "goals",
          patch: ["First patched goal", "Second patched goal"],
          expectedPlanningGeneration: generation,
          policyApproval: policyApproval()
        }
      },
      ctx(workspace)
    );

    assert.equal(patched.ok, true);
    assert.equal(patched.code, "patch-plan-artifact-persisted");

    const stored = readIdeaPlanArtifact(workspace, planRef);
    assert.deepEqual(stored.goals, ["First patched goal", "Second patched goal"]);
  });

  it("patches a single WBS row by id", async () => {
    const workspace = await tmpWorkspace();
    const { idea, fixture } = await createIdeaWithUnifiedPlan(workspace, "planning-state.fixture.json");
    const { planRef } = await seedPlanningDraft(workspace, idea, fixture);

    const generation = await planningGeneration(workspace);
    const patched = await planningModule.onCommand(
      {
        name: "patch-plan-artifact",
        args: {
          planRef,
          section: "wbs",
          wbsId: "WBS-1",
          patch: {
            title: "Patched WBS row title",
            doneMeans: "Row is done when patch persists"
          },
          expectedPlanningGeneration: generation,
          policyApproval: policyApproval()
        }
      },
      ctx(workspace)
    );

    assert.equal(patched.ok, true);
    assert.equal(patched.code, "patch-plan-artifact-persisted");
    assert.equal(patched.data.patchedWbsId, "WBS-1");

    const stored = readIdeaPlanArtifact(workspace, planRef);
    const row = stored.wbs?.find((entry) => entry.wbsId === "WBS-1");
    assert.equal(row?.title, "Patched WBS row title");
    assert.equal(row?.doneMeans, "Row is done when patch persists");
  });

  it("rejects unsupported section names", async () => {
    const workspace = await tmpWorkspace();
    const { idea, fixture } = await createIdeaWithUnifiedPlan(workspace, "planning-state.fixture.json");
    const { planRef } = await seedPlanningDraft(workspace, idea, fixture);

    const generation = await planningGeneration(workspace);
    const result = await planningModule.onCommand(
      {
        name: "patch-plan-artifact",
        args: {
          planRef,
          section: "architecture",
          patch: { overview: "nope" },
          expectedPlanningGeneration: generation,
          policyApproval: policyApproval()
        }
      },
      ctx(workspace)
    );

    assert.equal(result.ok, false);
    assert.equal(result.code, "patch-section-invalid");
  });

  it("rejects wbs patch when wbsId is missing", async () => {
    const workspace = await tmpWorkspace();
    const { idea, fixture } = await createIdeaWithUnifiedPlan(workspace, "planning-state.fixture.json");
    const { planRef } = await seedPlanningDraft(workspace, idea, fixture);

    const generation = await planningGeneration(workspace);
    const result = await planningModule.onCommand(
      {
        name: "patch-plan-artifact",
        args: {
          planRef,
          section: "wbs",
          patch: { title: "No id patch" },
          expectedPlanningGeneration: generation,
          policyApproval: policyApproval()
        }
      },
      ctx(workspace)
    );

    assert.equal(result.ok, false);
    assert.equal(result.code, "wbs-id-required");
  });

  it("rejects wbs patch when row id is unknown", async () => {
    const workspace = await tmpWorkspace();
    const { idea, fixture } = await createIdeaWithUnifiedPlan(workspace, "planning-state.fixture.json");
    const { planRef } = await seedPlanningDraft(workspace, idea, fixture);

    const generation = await planningGeneration(workspace);
    const result = await planningModule.onCommand(
      {
        name: "patch-plan-artifact",
        args: {
          planRef,
          section: "wbs",
          wbsId: "WBS-missing",
          patch: { title: "Ghost row" },
          expectedPlanningGeneration: generation,
          policyApproval: policyApproval()
        }
      },
      ctx(workspace)
    );

    assert.equal(result.ok, false);
    assert.equal(result.code, "wbs-not-found");
  });

  it("rejects structurally invalid WBS patches after merge", async () => {
    const workspace = await tmpWorkspace();
    const { idea, fixture } = await createIdeaWithUnifiedPlan(workspace, "planning-state.fixture.json");
    const { planRef } = await seedPlanningDraft(workspace, idea, fixture);

    const generation = await planningGeneration(workspace);
    const result = await planningModule.onCommand(
      {
        name: "patch-plan-artifact",
        args: {
          planRef,
          section: "wbs",
          wbsId: "WBS-1",
          patch: { acceptanceCriteria: [] },
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
});

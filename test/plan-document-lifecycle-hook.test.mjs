/**
 * T100794 — best-effort generate-plan-document hooks on planning lifecycle commands.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { ideasModule, planningModule } from "../dist/index.js";
import { getPlanArtifactStoragePaths } from "../dist/core/planning/plan-artifact-storage.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ideasFixturesDir = path.join(repoRoot, "fixtures", "ideas");
const planningFixturesDir = path.join(repoRoot, "fixtures", "planning");
const SQLITE_CFG = { tasks: { persistenceBackend: "sqlite" } };

function policyApproval(rationale = "plan-document-lifecycle-hook.test.mjs") {
  return { confirmed: true, rationale };
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

async function tmpWorkspace() {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "wk-plan-doc-hook-"));
  await mkdir(path.join(workspace, ".workspace-kit/tasks"), { recursive: true });
  await mkdir(path.join(workspace, "src/modules/documentation/views"), { recursive: true });
  await mkdir(path.join(workspace, "src/modules/documentation/templates"), { recursive: true });
  await writeFile(
    path.join(workspace, "src/modules/documentation/views/plan-document.view.yaml"),
    await readFile(path.join(repoRoot, "src/modules/documentation/views/plan-document.view.yaml"), "utf8")
  );
  await writeFile(
    path.join(workspace, "src/modules/documentation/templates/plan-document.md"),
    await readFile(path.join(repoRoot, "src/modules/documentation/templates/plan-document.md"), "utf8")
  );
  return workspace;
}

function ctx(workspace) {
  return { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG };
}

async function seedIdeaPlanFixture(workspace, fixtureName) {
  const fixture = structuredClone(loadJson(path.join(ideasFixturesDir, fixtureName)));
  const paths = getPlanArtifactStoragePaths(workspace, fixture.planId);
  await mkdir(paths.planDirAbsolute, { recursive: true });
  await writeFile(paths.artifactFileAbsolute(fixture.version), `${JSON.stringify(fixture, null, 2)}\n`, "utf8");
  return fixture;
}

describe("plan-document lifecycle hooks (T100794)", () => {
  it("draft-plan-artifact persist returns generatedPlanDocPath and writes markdown", async () => {
    const workspace = await tmpWorkspace();
    const created = await ideasModule.onCommand(
      { name: "create-idea", args: { title: "Hook draft test", policyApproval: policyApproval() } },
      ctx(workspace)
    );
    assert.equal(created.ok, true);
    const ideaId = created.data.idea.id;
    const started = await ideasModule.onCommand(
      { name: "start-idea-planning", args: { ideaId, policyApproval: policyApproval() } },
      ctx(workspace)
    );
    assert.equal(started.ok, true);
    const artifact = structuredClone(loadJson(path.join(planningFixturesDir, "plan-artifact-minimal.valid.v1.json")));
    artifact.provenance = { ...artifact.provenance, sourceIdeaId: ideaId };

    const drafted = await planningModule.onCommand(
      {
        name: "draft-plan-artifact",
        args: {
          persist: true,
          artifact,
          ideaId,
          expectedPlanningGeneration: 0,
          policyApproval: policyApproval()
        }
      },
      ctx(workspace)
    );
    assert.equal(drafted.ok, true, drafted.message);
    assert.equal(typeof drafted.data.generatedPlanDocPath, "string");
    assert.equal(fs.existsSync(path.join(workspace, drafted.data.generatedPlanDocPath)), true);
  });

  it("accept-plan-artifact returns generatedPlanDocPath with accepted status in rendered doc", async () => {
    const workspace = await tmpWorkspace();
    const fixture = await seedIdeaPlanFixture(workspace, "accepted-state-plan-document.fixture.json");
    const approvalRecord = {
      schemaVersion: 1,
      confirmed: true,
      approvedVersion: fixture.acceptance.acceptedVersion,
      approvedAt: fixture.acceptance.acceptedAt,
      approvedBy: fixture.acceptance.acceptedBy,
      planRef: fixture.planRef,
      reviewSummary: "Fixture review passed",
      openQuestionsAccepted: fixture.openQuestions ?? []
    };

    const accepted = await planningModule.onCommand(
      {
        name: "accept-plan-artifact",
        args: {
          planId: fixture.planId,
          approvalRecord,
          openQuestionsAccepted: fixture.openQuestions ?? [],
          expectedPlanningGeneration: 0,
          policyApproval: policyApproval()
        }
      },
      ctx(workspace)
    );
    assert.equal(accepted.ok, true, accepted.message);
    assert.equal(typeof accepted.data.generatedPlanDocPath, "string");
    const markdown = await readFile(path.join(workspace, accepted.data.generatedPlanDocPath), "utf8");
    assert.match(markdown, /\| Status \| `accepted` \|/);
  });

  it("generate-plan-document failure does not fail primary accept-plan-artifact", async () => {
    const workspace = await tmpWorkspace();
    const fixture = await seedIdeaPlanFixture(workspace, "accepted-state-plan-document.fixture.json");
    await fs.promises.rm(path.join(workspace, "src/modules/documentation/templates/plan-document.md"));

    const accepted = await planningModule.onCommand(
        {
          name: "accept-plan-artifact",
          args: {
            planId: fixture.planId,
            approvalRecord: {
              schemaVersion: 1,
              confirmed: true,
              approvedVersion: fixture.acceptance.acceptedVersion,
              approvedAt: fixture.acceptance.acceptedAt,
              approvedBy: fixture.acceptance.acceptedBy,
              planRef: fixture.planRef
            },
            expectedPlanningGeneration: 0,
            policyApproval: policyApproval()
          }
        },
      ctx(workspace)
    );
    assert.equal(accepted.ok, true, accepted.message);
    assert.equal(accepted.data.generatedPlanDocPath, undefined);
  });
});

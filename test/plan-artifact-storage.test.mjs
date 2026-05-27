import assert from "node:assert/strict";
import fs from "node:fs";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const {
  PLAN_ARTIFACT_ROOT_REL,
  getPlanArtifactStoragePaths,
  listPlanArtifactSummaries,
  readLatestPlanArtifact,
  readPlanArtifactIndex,
  readPlanArtifactVersion,
  resolveLatestPlanArtifactVersion,
  writeNextPlanArtifactVersion,
  writePlanArtifactVersion
} = await import(path.join(root, "dist/core/planning/plan-artifact-storage.js"));

const minimalPlan = JSON.parse(
  fs.readFileSync(path.join(root, "fixtures/planning/plan-artifact-minimal.valid.v1.json"), "utf8")
);

describe("plan-artifact storage layer", () => {
  it("round-trips artifact JSON and index", async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "wk-plan-store-"));
    const paths = writePlanArtifactVersion(workspace, minimalPlan);
    assert.equal(paths.rootRelative, PLAN_ARTIFACT_ROOT_REL);
    assert.ok(fs.existsSync(paths.artifactFileAbsolute(1)));

    const roundTrip = readPlanArtifactVersion(workspace, minimalPlan.planId, 1);
    assert.deepEqual(roundTrip, minimalPlan);

    const index = readPlanArtifactIndex(workspace, minimalPlan.planId);
    assert.equal(index?.currentVersion, 1);
    assert.equal(index?.title, minimalPlan.identity.title);
    assert.equal(index?.wbsRowCount, 1);
  });

  it("lists summaries and bumps version", async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "wk-plan-store-"));
    writePlanArtifactVersion(workspace, minimalPlan);

    const bumped = writeNextPlanArtifactVersion(workspace, {
      ...minimalPlan,
      status: "reviewed",
      provenance: {
        ...minimalPlan.provenance,
        updatedAt: "2026-05-27T08:00:00.000Z"
      }
    });
    assert.equal(bumped.artifact.version, 2);
    assert.equal(resolveLatestPlanArtifactVersion(workspace, minimalPlan.planId), 2);

    const latest = readLatestPlanArtifact(workspace, minimalPlan.planId);
    assert.equal(latest?.status, "reviewed");
    assert.equal(latest?.version, 2);

    const summaries = listPlanArtifactSummaries(workspace);
    assert.equal(summaries.length, 1);
    assert.equal(summaries[0].currentVersion, 2);

    const storagePaths = getPlanArtifactStoragePaths(workspace, minimalPlan.planId);
    assert.ok(storagePaths.artifactFileAbsolute(1).endsWith("artifact.v1.json"));
    assert.ok(storagePaths.artifactFileAbsolute(2).endsWith("artifact.v2.json"));
  });
});

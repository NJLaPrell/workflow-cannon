/**
 * WP-4.6 / T100464 — review-plan-artifact pass/fail/coverage-gap fixtures + integration.
 * PLANNER_TEST_STRATEGY.md §2, §5 B2, §6.2.
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import { mkdir, mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { planningModule } from "../dist/index.js";
import { reviewPlanArtifact } from "../dist/core/planning/review-plan-artifact.js";
import { validatePlanArtifactDocument } from "../dist/core/planning/validate-plan-artifact.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturesDir = path.join(repoRoot, "fixtures", "planning");
const SQLITE_CFG = { tasks: { persistenceBackend: "sqlite" } };

/** Catalog: pass | warnings | coverage-gap (blocked). */
const REVIEW_FIXTURE_MATRIX = [
  {
    category: "pass",
    fixture: "plan-artifact-minimal.valid.v1.json",
    profile: "minimal",
    expectCode: "plan-artifact-review-complete",
    expectPassed: true
  },
  {
    category: "pass",
    fixture: "plan-artifact-full-feature.valid.v1.json",
    profile: "full-feature",
    expectCode: "plan-artifact-review-complete",
    expectPassed: true,
    warningCodes: ["RUBRIC-OQ-UNRESOLVED"]
  },
  {
    category: "warnings",
    fixture: "plan-artifact-review-warnings.v1.json",
    profile: "full-feature",
    expectCode: "plan-artifact-review-complete",
    expectPassed: true,
    warningCodes: ["RUBRIC-OQ-UNRESOLVED", "RUBRIC-WBS-VAGUE-AC"]
  },
  {
    category: "coverage-gap",
    fixture: "plan-artifact-review-blockers.v1.json",
    profile: "refactor",
    expectCode: "plan-artifact-review-blocked",
    expectPassed: false,
    blockerCodes: ["RUBRIC-COV-GOAL", "RUBRIC-COV-TEST"]
  }
];

const REVIEW_FIXTURE_FILES = [
  "plan-artifact-minimal.valid.v1.json",
  "plan-artifact-full-feature.valid.v1.json",
  "plan-artifact-review-warnings.v1.json",
  "plan-artifact-review-blockers.v1.json",
  "wbs-oversized-row.v1.json",
  "wbs-medium-large-row.v1.json",
  "wbs-vague-ac.v1.json"
];

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
  const workspace = await mkdtemp(path.join(os.tmpdir(), "wk-plan-review-fix-"));
  await mkdir(path.join(workspace, ".workspace-kit", "tasks"), { recursive: true });
  return workspace;
}

async function draftPersist(workspace, artifact) {
  const result = await planningModule.onCommand(
    {
      name: "draft-plan-artifact",
      args: {
        persist: true,
        artifact,
        expectedPlanningGeneration: 0,
        policyApproval: { confirmed: true, rationale: "plan-artifact-review-fixtures.integration.test.mjs" }
      }
    },
    { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG }
  );
  assert.equal(result.ok, true, result.message);
  return result;
}

describe("review-plan-artifact fixtures catalog (T100464)", () => {
  for (const name of REVIEW_FIXTURE_FILES) {
    it(`schema-validates ${name}`, () => {
      const raw = loadFixture(name);
      const result = validatePlanArtifactDocument(raw, { workspaceRoot: repoRoot });
      assert.equal(result.ok, true, `${name}: ${result.code ?? JSON.stringify(result.errors)}`);
    });
  }
});

describe("review-plan-artifact fixture matrix (T100464)", () => {
  for (const row of REVIEW_FIXTURE_MATRIX) {
    it(`${row.category}: ${row.fixture} via reviewPlanArtifact`, () => {
      const artifact = loadFixture(row.fixture);
      const result = reviewPlanArtifact(artifact, { profile: row.profile });
      assert.equal(result.passed, row.expectPassed, JSON.stringify(result.blockers, null, 2));
      if (row.blockerCodes) {
        for (const code of row.blockerCodes) {
          assert.ok(result.blockers.some((b) => b.code === code), `missing blocker ${code}`);
        }
      }
      if (row.warningCodes) {
        for (const code of row.warningCodes) {
          assert.ok(result.warnings.some((w) => w.code === code), `missing warning ${code}`);
        }
      }
    });

    it(`${row.category}: ${row.fixture} via wk run review-plan-artifact`, async () => {
      const workspace = await tmpWorkspace();
      const artifact = freshArtifact(loadFixture(row.fixture));
      const result = await planningModule.onCommand(
        {
          name: "review-plan-artifact",
          args: { artifact, profile: row.profile }
        },
        { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG }
      );
      assert.equal(result.ok, true);
      assert.equal(result.code, row.expectCode);
      assert.equal(result.data.passed, row.expectPassed);
      assert.equal(result.data.profile, row.profile);
    });
  }

  it("coverage-gap fixture coverageMap snapshot", () => {
    const artifact = loadFixture("plan-artifact-review-blockers.v1.json");
    const result = reviewPlanArtifact(artifact, { profile: "refactor" });
    assert.deepEqual(result.coverageMap.goals, {
      covered: ["Goal alpha is mapped in WBS goalMapping"],
      uncovered: ["Goal beta has no WBS mapping and should block review"]
    });
    assert.equal(result.coverageMap.slices.testing, "missing");
    assert.equal(result.coverageMap.slices.architecture, "missing");
  });
});

describe("review-plan-artifact golden draft→review (T100464)", () => {
  for (const row of REVIEW_FIXTURE_MATRIX) {
    it(`draft persist then review by planId — ${row.category}`, async () => {
      const workspace = await tmpWorkspace();
      const artifact = freshArtifact(loadFixture(row.fixture));
      const draft = await draftPersist(workspace, artifact);
      const review = await planningModule.onCommand(
        {
          name: "review-plan-artifact",
          args: { planId: draft.data.planId, profile: row.profile }
        },
        { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: SQLITE_CFG }
      );
      assert.equal(review.ok, true);
      assert.equal(review.code, row.expectCode);
      assert.equal(review.data.planId, draft.data.planId);
      assert.equal(review.data.version, 1);
    });
  }
});

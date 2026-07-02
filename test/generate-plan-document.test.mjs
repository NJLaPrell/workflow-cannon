/**
 * T100793 — generate-plan-document command, view, and template.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { planningModule } from "../dist/index.js";
import { getPlanArtifactStoragePaths } from "../dist/core/planning/plan-artifact-storage.js";
import {
  derivePlanDocumentBasename,
  derivePlanDocumentSlug,
  renderPlanDocumentMarkdown,
  scoreBandForKind
} from "../dist/core/planning/index.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ideasFixturesDir = path.join(repoRoot, "fixtures", "ideas");

function loadIdeaFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(ideasFixturesDir, name), "utf8"));
}

async function tmpWorkspace() {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "wk-generate-plan-doc-"));
  await mkdir(path.join(workspace, "src/modules/documentation/views"), { recursive: true });
  await mkdir(path.join(workspace, "src/modules/documentation/templates"), { recursive: true });
  await mkdir(path.join(workspace, "docs/maintainers/plans"), { recursive: true });
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
  return { runtimeVersion: "0.1", workspacePath: workspace, effectiveConfig: {} };
}

function policyApproval() {
  return { confirmed: true, rationale: "generate-plan-document.test.mjs" };
}

async function writeFixture(workspace, fixtureName) {
  const fixture = loadIdeaFixture(fixtureName);
  const paths = getPlanArtifactStoragePaths(workspace, fixture.planId);
  await mkdir(paths.planDirAbsolute, { recursive: true });
  await writeFile(paths.artifactFileAbsolute(fixture.version), `${JSON.stringify(fixture, null, 2)}\n`, "utf8");
  return fixture;
}

describe("generate-plan-document (T100793)", () => {
  it("produces valid markdown for accepted-state unified document fixture", async () => {
    const workspace = await tmpWorkspace();
    const fixture = await writeFixture(workspace, "accepted-state-plan-document.fixture.json");

    const result = await planningModule.onCommand(
      {
        name: "generate-plan-document",
        args: {
          planId: fixture.planId,
          policyApproval: policyApproval()
        }
      },
      ctx(workspace)
    );

    assert.equal(result.ok, true);
    assert.equal(result.code, "plan-document-generated");
    const outputPath = path.join(workspace, result.data.outputPath);
    assert.equal(fs.existsSync(outputPath), true);
    const markdown = await readFile(outputPath, "utf8");
    assert.match(markdown, /^# My Great Plan: Phase 140!/m);
    assert.match(markdown, /\| Status \| `accepted` \|/);
    assert.match(markdown, /## Brainstorm synthesis/);
    assert.match(markdown, /## WBS summary/);
    assert.match(markdown, /`WBS-7A`/);
    assert.match(markdown, /`WBS-7B`/);
    assert.doesNotMatch(markdown, /<!--PLAN_DOC:/);
  });

  it("derives output path slug from title with spaces, capitals, and punctuation", () => {
    const slug = derivePlanDocumentSlug("My Great Plan: Phase 140!");
    assert.equal(slug, "my-great-plan-phase-140");
    const basename = derivePlanDocumentBasename("I042", "My Great Plan: Phase 140!");
    assert.equal(basename, "I042-my-great-plan-phase-140");
  });

  it("renders brainstorm synthesis with correct color-band labels", async () => {
    const workspace = await tmpWorkspace();
    const fixture = await writeFixture(workspace, "accepted-state-plan-document.fixture.json");
    const { markdown } = renderPlanDocumentMarkdown(workspace, fixture);

    assert.match(markdown, /\| Value \| 9 \| \*\*green\*\* \|/);
    assert.match(markdown, /\| Risk \| 2 \| \*\*green\*\* \|/);
    assert.match(markdown, /\| Effort \| 3 \| \*\*green\*\* \|/);
    assert.match(markdown, /\| Confidence \| 8 \| \*\*green\*\* \|/);
    assert.match(markdown, /\| Priority \| 80 \| \*\*green\*\* \|/);
    assert.equal(scoreBandForKind(9, "value"), "green");
    assert.equal(scoreBandForKind(2, "risk"), "green");
  });

  it("WBS summary table contains all WBS items from fixture", async () => {
    const workspace = await tmpWorkspace();
    const fixture = await writeFixture(workspace, "accepted-state-plan-document.fixture.json");
    const { markdown } = renderPlanDocumentMarkdown(workspace, fixture);

    assert.match(markdown, /\| `WBS-7A` \| Plan document view and template \| medium \| — \|/);
    assert.match(markdown, /\| `WBS-7B` \| Wire lifecycle regeneration \| medium \| WBS-7A \|/);
    const wbsRows = [...markdown.matchAll(/\| `WBS-/g)];
    assert.equal(wbsRows.length, 2);
  });
});

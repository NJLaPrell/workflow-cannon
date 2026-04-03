import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { validateRoadmapData, validateFeatureTaxonomyData } from "../dist/modules/documentation/data-schema-validate.js";
import { renderRoadmapFromSourceRoot, renderRoadmapMarkdown } from "../dist/modules/documentation/roadmap-render.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("validateRoadmapData rejects invalid payload with path-qualified errors", () => {
  const r = validateRoadmapData({ schemaVersion: 1, title: "x" });
  assert.equal(r.ok, false);
  assert.ok(r.errors.length > 0);
  assert.ok(r.errors.some((e) => e.includes("must have required property") || e.includes("required")));
});

test("validateFeatureTaxonomyData rejects duplicate slugs", () => {
  const r = validateFeatureTaxonomyData({
    schemaVersion: 1,
    features: [
      { category: "A", slug: "dup", name: "n", covers: "c" },
      { category: "B", slug: "dup", name: "n2", covers: "c2" }
    ]
  });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes("duplicate")));
});

test("renderRoadmapFromSourceRoot succeeds for this repository", () => {
  const r = renderRoadmapFromSourceRoot(repoRoot);
  assert.ok("markdown" in r);
  assert.ok(r.markdown.includes("# Workflow Cannon Roadmap"));
  assert.ok(r.markdown.includes("## Product feature taxonomy"));
  assert.ok(r.filesRead.length >= 3);
});

test("renderRoadmapMarkdown golden fragment", () => {
  const md = renderRoadmapMarkdown(
    {
      schemaVersion: 1,
      title: "T",
      subtitle: "S",
      scope: ["a"],
      currentState: ["b"],
      featureTaxonomy: { enabled: false, intro: "", taxonomyFile: "feature-taxonomy.json" },
      phasePlanIntro: "intro",
      phaseSectionsFile: "x.md",
      decisions: [{ decision: "D", choice: "C" }],
      executionEvidence: ["e1"]
    },
    "### Phase 99\n\n- body\n",
    {
      schemaVersion: 1,
      features: [{ category: "Cat", slug: "slug", name: "N", covers: "Covers" }]
    }
  );
  assert.ok(md.includes("# T"));
  assert.ok(md.includes("### Phase 99"));
  assert.ok(md.includes("| D | C |"));
});

#!/usr/bin/env node
/**
 * Validates documentation JSON (roadmap + feature taxonomy), then ensures
 * committed ROADMAP.md / FEATURE-TAXONOMY.md match the deterministic renderer.
 * Requires a fresh `tsc` emit to `dist/` (same as `pnpm run build`).
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tscJs = path.join(root, "node_modules", "typescript", "lib", "tsc.js");

const compile = spawnSync(process.execPath, [tscJs, "-p", "tsconfig.json"], {
  cwd: root,
  stdio: "inherit"
});
if (compile.status !== 0) {
  process.exit(compile.status ?? 1);
}

const { readAndValidateRoadmapData, readAndValidateFeatureTaxonomyData } = await import(
  "../dist/modules/documentation/data-schema-validate.js"
);
const { renderRoadmapFromSourceRoot, renderFeatureTaxonomyDocFromSourceRoot } = await import(
  "../dist/modules/documentation/roadmap-render.js"
);

const roadmapHuman = path.join(root, "docs", "maintainers", "ROADMAP.md");
const taxonomyHuman = path.join(root, "docs", "maintainers", "FEATURE-TAXONOMY.md");

const rr = readAndValidateRoadmapData(root);
if (!rr.ok) {
  console.error("roadmap-data.json validation failed:\n", rr.errors.join("\n"));
  process.exit(1);
}
const tr = readAndValidateFeatureTaxonomyData(root, rr.data.featureTaxonomy.taxonomyFile);
if (!tr.ok) {
  console.error("feature taxonomy validation failed:\n", tr.errors.join("\n"));
  process.exit(1);
}

const docTaxonomyJsonOnly =
  process.env.WORKSPACE_KIT_DOC_TAXONOMY_JSON_ONLY === "1" ||
  process.env.WORKSPACE_KIT_DOC_TAXONOMY_JSON_ONLY === "true";
const planningDbAbs = path.join(root, ".workspace-kit/tasks/workspace-kit.db");
const roadmapRenderOpts =
  !docTaxonomyJsonOnly && existsSync(planningDbAbs)
    ? { planningDatabaseAbsolutePath: planningDbAbs }
    : undefined;

const renderedRoadmap = renderRoadmapFromSourceRoot(root, roadmapRenderOpts);
if (!("markdown" in renderedRoadmap)) {
  console.error("roadmap render failed:\n", renderedRoadmap.errors.join("\n"));
  process.exit(1);
}
const onDiskRoadmap = readFileSync(roadmapHuman, "utf8");
if (onDiskRoadmap !== renderedRoadmap.markdown) {
  console.error(
    "Committed docs/maintainers/ROADMAP.md does not match generator output.\n" +
      "Regenerate: pnpm run wk run generate-document '{\"documentType\":\"ROADMAP.md\"}'"
  );
  process.exit(1);
}

const renderedTax = renderFeatureTaxonomyDocFromSourceRoot(root, roadmapRenderOpts);
if (!("markdown" in renderedTax)) {
  console.error("feature taxonomy doc render failed:\n", renderedTax.errors.join("\n"));
  process.exit(1);
}
const onDiskTax = readFileSync(taxonomyHuman, "utf8");
if (onDiskTax !== renderedTax.markdown) {
  console.error(
    "Committed docs/maintainers/FEATURE-TAXONOMY.md does not match generator output.\n" +
      "Regenerate: pnpm run wk run generate-document '{\"documentType\":\"FEATURE-TAXONOMY.md\"}'"
  );
  process.exit(1);
}

console.log("documentation data + maintainer markdown drift checks passed");

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { FeatureTaxonomyData, RoadmapData } from "./data-schema-validate.js";
import { documentationDataDir, readAndValidateFeatureTaxonomyData, readAndValidateRoadmapData } from "./data-schema-validate.js";

const ROADMAP_BANNER =
  "<!-- GENERATED: do not hand-edit. Source: `src/modules/documentation/data/roadmap-data.json`, `roadmap-phase-sections.md`, `feature-taxonomy.json`. Regenerate: `pnpm run wk run generate-document '{\"documentType\":\"ROADMAP.md\"}'`. -->";

const FEATURE_DOC_BANNER =
  "<!-- GENERATED: do not hand-edit. Source: `src/modules/documentation/data/feature-taxonomy.json`. Regenerate: `pnpm run wk run generate-document '{\"documentType\":\"FEATURE-TAXONOMY.md\"}'`. -->";

function bulletList(lines: string[]): string {
  return lines.map((l) => `- ${l}`).join("\n");
}

function markdownTable(headers: string[], rows: string[][]): string {
  const esc = (c: string) => c.replace(/\|/g, "\\|");
  const head = `| ${headers.map(esc).join(" | ")} |`;
  const sep = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows.map((r) => `| ${r.map(esc).join(" | ")} |`).join("\n");
  return [head, sep, body].join("\n");
}

export function renderRoadmapTaxonomyTable(tax: FeatureTaxonomyData): string {
  const rows = tax.features.map((f) => [f.category, `\`${f.slug}\``, f.name, f.covers]);
  return markdownTable(["Category", "Slug", "Feature", "Covers"], rows);
}

export function renderRoadmapMarkdown(data: RoadmapData, phaseSectionsBody: string, taxonomy: FeatureTaxonomyData): string {
  const parts: string[] = [];
  parts.push(`# ${data.title}`, "", data.subtitle, "", ROADMAP_BANNER, "");
  parts.push("## Scope", "", bulletList(data.scope), "");
  parts.push("## Current state", "", bulletList(data.currentState), "");

  if (data.featureTaxonomy.enabled) {
    parts.push("## Product feature taxonomy", "", data.featureTaxonomy.intro, "");
    parts.push(renderRoadmapTaxonomyTable(taxonomy), "");
  }

  parts.push("## Phase plan and release cadence", "", data.phasePlanIntro.trim(), "", phaseSectionsBody.trim(), "");
  parts.push(
    "## Recorded decisions",
    "",
    markdownTable(
      ["Decision", "Choice"],
      data.decisions.map((d) => [d.decision, d.choice])
    ),
    ""
  );
  parts.push("## Execution evidence snapshot", "", bulletList(data.executionEvidence), "");
  return `${parts.join("\n").trim()}\n`;
}

export function renderFeatureTaxonomyMaintainerDoc(tax: FeatureTaxonomyData): string {
  const categories = new Set(tax.features.map((f) => f.category));
  const lines: string[] = [
    "# Feature taxonomy (task coverage)",
    "",
    "Canonical **product features** for mapping **task-engine** work: each task should reference **one or more** feature slugs. Features are grouped into **categories** for reporting, filtering, and roadmap roll-ups.",
    "",
    FEATURE_DOC_BANNER,
    "",
    "## How to use",
    "",
    "- **Slug** — Stable identifier for APIs, DB, and `list-tasks` filters; use **kebab-case**, never rename once shipped (add a new slug and deprecate in docs if a concept splits).",
    "- **Category** — Roll-up only; a task may span categories by listing multiple features.",
    "- **Task mapping** — Prefer **1–3** features per task; use more only when the task truly cuts across surfaces.",
    "",
    "## Categories and features",
    "",
    "The table below is generated from **`src/modules/documentation/data/feature-taxonomy.json`**.",
    "",
    renderRoadmapTaxonomyTable(tax),
    "",
    `**Count:** ${categories.size} categories, ${tax.features.length} features.`,
    ""
  ];
  return lines.join("\n");
}

export type RoadmapRenderResult = {
  markdown: string;
  filesRead: string[];
};

export function renderRoadmapFromSourceRoot(sourceRoot: string): RoadmapRenderResult | { ok: false; errors: string[] } {
  const rd = readAndValidateRoadmapData(sourceRoot);
  if (!rd.ok) {
    return { ok: false, errors: rd.errors };
  }
  const data = rd.data;
  const dataDir = documentationDataDir(sourceRoot);
  const phasePath = join(dataDir, data.phaseSectionsFile);
  let phaseBody: string;
  try {
    phaseBody = readFileSync(phasePath, "utf8");
  } catch (e) {
    return { ok: false, errors: [`${phasePath}: ${(e as Error).message}`] };
  }
  const tax = readAndValidateFeatureTaxonomyData(sourceRoot, data.featureTaxonomy.taxonomyFile);
  if (!tax.ok) {
    return { ok: false, errors: tax.errors };
  }
  const markdown = renderRoadmapMarkdown(data, phaseBody, tax.data);
  return {
    markdown,
    filesRead: [rd.path, phasePath, tax.path]
  };
}

export function renderFeatureTaxonomyDocFromSourceRoot(
  sourceRoot: string
): RoadmapRenderResult | { ok: false; errors: string[] } {
  const roadmap = readAndValidateRoadmapData(sourceRoot);
  if (!roadmap.ok) {
    return { ok: false, errors: roadmap.errors };
  }
  const tax = readAndValidateFeatureTaxonomyData(sourceRoot, roadmap.data.featureTaxonomy.taxonomyFile);
  if (!tax.ok) {
    return { ok: false, errors: tax.errors };
  }
  return {
    markdown: renderFeatureTaxonomyMaintainerDoc(tax.data),
    filesRead: [roadmap.path, tax.path]
  };
}

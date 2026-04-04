import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { readKitSqliteUserVersion } from "../../core/state/workspace-kit-sqlite.js";
import { KIT_FEATURE_REGISTRY_MIN_USER_VERSION } from "../../core/state/feature-registry-migration.js";
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
    "The table below is generated from the **planning SQLite feature registry** when available (`user_version` 5+), otherwise from **`src/modules/documentation/data/feature-taxonomy.json`** (export with `export-feature-taxonomy-json`).",
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

export type RoadmapRenderOptions = {
  /** When set and `user_version` ≥ 5, taxonomy tables are read from the registry instead of JSON. */
  planningDatabaseAbsolutePath?: string;
};

/** Read taxonomy rows from planning SQLite (readonly; no migrations). */
export function loadFeatureTaxonomyDataFromPlanningDbAbsolute(dbAbsPath: string): FeatureTaxonomyData | null {
  if (!existsSync(dbAbsPath)) {
    return null;
  }
  let uv = 0;
  try {
    uv = readKitSqliteUserVersion(dbAbsPath);
  } catch {
    return null;
  }
  if (uv < KIT_FEATURE_REGISTRY_MIN_USER_VERSION) {
    return null;
  }
  const db = new Database(dbAbsPath, { readonly: true });
  try {
    const rows = db
      .prepare(
        `SELECT c.display_name AS category, f.id AS slug, f.name AS name, f.covers AS covers
         FROM task_engine_features f
         INNER JOIN task_engine_components c ON c.id = f.component_id
         ORDER BY c.sort_order ASC, c.id ASC, f.id ASC`
      )
      .all() as Array<{ category: string; slug: string; name: string; covers: string }>;
    if (rows.length === 0) {
      return null;
    }
    return { schemaVersion: 1, features: rows };
  } catch {
    return null;
  } finally {
    db.close();
  }
}

function resolveTaxonomyForRender(
  sourceRoot: string,
  taxonomyFile: string,
  options: RoadmapRenderOptions | undefined,
  filesRead: string[]
): { ok: true; data: FeatureTaxonomyData; jsonPath: string } | { ok: false; errors: string[] } {
  const dbPath = options?.planningDatabaseAbsolutePath;
  if (dbPath) {
    const fromDb = loadFeatureTaxonomyDataFromPlanningDbAbsolute(dbPath);
    if (fromDb && fromDb.features.length > 0) {
      filesRead.push(dbPath);
      const dir = documentationDataDir(sourceRoot);
      const jsonPath = join(dir, taxonomyFile);
      return { ok: true, data: fromDb, jsonPath };
    }
  }
  const tax = readAndValidateFeatureTaxonomyData(sourceRoot, taxonomyFile);
  if (!tax.ok) {
    return { ok: false, errors: tax.errors };
  }
  filesRead.push(tax.path);
  return { ok: true, data: tax.data, jsonPath: tax.path };
}

export function renderRoadmapFromSourceRoot(
  sourceRoot: string,
  options?: RoadmapRenderOptions
): RoadmapRenderResult | { ok: false; errors: string[] } {
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
  const filesRead: string[] = [rd.path, phasePath];
  const tax = resolveTaxonomyForRender(sourceRoot, data.featureTaxonomy.taxonomyFile, options, filesRead);
  if (!tax.ok) {
    return { ok: false, errors: tax.errors };
  }
  const markdown = renderRoadmapMarkdown(data, phaseBody, tax.data);
  return {
    markdown,
    filesRead
  };
}

export function renderFeatureTaxonomyDocFromSourceRoot(
  sourceRoot: string,
  options?: RoadmapRenderOptions
): RoadmapRenderResult | { ok: false; errors: string[] } {
  const roadmap = readAndValidateRoadmapData(sourceRoot);
  if (!roadmap.ok) {
    return { ok: false, errors: roadmap.errors };
  }
  const filesRead: string[] = [roadmap.path];
  const tax = resolveTaxonomyForRender(
    sourceRoot,
    roadmap.data.featureTaxonomy.taxonomyFile,
    options,
    filesRead
  );
  if (!tax.ok) {
    return { ok: false, errors: tax.errors };
  }
  return {
    markdown: renderFeatureTaxonomyMaintainerDoc(tax.data),
    filesRead
  };
}

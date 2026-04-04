import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type Database from "better-sqlite3";

type SqliteDatabase = InstanceType<typeof Database>;

export const TASK_ENGINE_COMPONENTS_TABLE = "task_engine_components";
export const TASK_ENGINE_FEATURES_TABLE = "task_engine_features";
export const TASK_ENGINE_TASK_FEATURES_TABLE = "task_engine_task_features";

/** Minimum kit SQLite user_version that creates the feature registry DDL. */
export const KIT_FEATURE_REGISTRY_MIN_USER_VERSION = 5;

export function slugifyCategoryLabel(category: string): string {
  const s = category
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s.length > 0 ? s : "uncategorized";
}

function resolveFeatureTaxonomyJsonPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, "..", "..", "..", "src", "modules", "documentation", "data", "feature-taxonomy.json"),
    join(here, "..", "..", "..", "..", "src", "modules", "documentation", "data", "feature-taxonomy.json")
  ];
  for (const p of candidates) {
    if (existsSync(p)) {
      return p;
    }
  }
  return candidates[0]!;
}

type TaxonomyFile = {
  features?: Array<{ category?: string; slug?: string; name?: string; covers?: string }>;
};

/**
 * Create registry tables (idempotent). `taskTable` is the relational tasks table name (e.g. task_engine_tasks).
 */
export function createFeatureRegistryTablesWithTaskTable(db: SqliteDatabase, taskTable: string): void {
  db.exec(`
CREATE TABLE IF NOT EXISTS ${TASK_ENGINE_COMPONENTS_TABLE} (
  id TEXT PRIMARY KEY NOT NULL,
  display_name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS ${TASK_ENGINE_FEATURES_TABLE} (
  id TEXT PRIMARY KEY NOT NULL,
  component_id TEXT NOT NULL,
  name TEXT NOT NULL,
  covers TEXT NOT NULL,
  FOREIGN KEY (component_id) REFERENCES ${TASK_ENGINE_COMPONENTS_TABLE}(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_task_engine_features_component ON ${TASK_ENGINE_FEATURES_TABLE}(component_id);
CREATE TABLE IF NOT EXISTS ${TASK_ENGINE_TASK_FEATURES_TABLE} (
  task_id TEXT NOT NULL,
  feature_id TEXT NOT NULL,
  PRIMARY KEY (task_id, feature_id),
  FOREIGN KEY (task_id) REFERENCES ${taskTable}(id) ON DELETE CASCADE,
  FOREIGN KEY (feature_id) REFERENCES ${TASK_ENGINE_FEATURES_TABLE}(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_task_engine_task_features_feature ON ${TASK_ENGINE_TASK_FEATURES_TABLE}(feature_id);
`);
}

/**
 * Seed components/features from shipped taxonomy JSON when the features table is empty.
 */
export function seedFeatureRegistryIfEmpty(db: SqliteDatabase, taskTable: string): void {
  createFeatureRegistryTablesWithTaskTable(db, taskTable);
  const count = db.prepare(`SELECT COUNT(1) AS c FROM ${TASK_ENGINE_FEATURES_TABLE}`).get() as { c: number };
  if (Number(count.c) > 0) {
    return;
  }
  const path = resolveFeatureTaxonomyJsonPath();
  const raw = JSON.parse(readFileSync(path, "utf8")) as TaxonomyFile;
  const list = raw.features ?? [];
  const componentOrder = new Map<string, number>();
  const componentLabels = new Map<string, string>();
  let ord = 0;
  for (const f of list) {
    const cat = typeof f.category === "string" ? f.category.trim() : "";
    const label = cat.length > 0 ? cat : "Uncategorized";
    const cid = slugifyCategoryLabel(label);
    if (!componentOrder.has(cid)) {
      componentOrder.set(cid, ord++);
      componentLabels.set(cid, label);
    }
  }
  const insertComp = db.prepare(
    `INSERT OR IGNORE INTO ${TASK_ENGINE_COMPONENTS_TABLE} (id, display_name, sort_order) VALUES (?,?,?)`
  );
  const insertFeat = db.prepare(
    `INSERT OR IGNORE INTO ${TASK_ENGINE_FEATURES_TABLE} (id, component_id, name, covers) VALUES (?,?,?,?)`
  );
  const run = db.transaction(() => {
    for (const [cid, sort] of [...componentOrder.entries()].sort((a, b) => a[1] - b[1])) {
      insertComp.run(cid, componentLabels.get(cid) ?? cid, sort);
    }
    for (const f of list) {
      const slug = typeof f.slug === "string" ? f.slug.trim() : "";
      if (!slug) {
        continue;
      }
      const cat = typeof f.category === "string" ? f.category.trim() : "";
      const label = cat.length > 0 ? cat : "Uncategorized";
      const cid = slugifyCategoryLabel(label);
      const name = typeof f.name === "string" ? f.name : slug;
      const covers = typeof f.covers === "string" ? f.covers : "";
      insertFeat.run(slug, cid, name, covers);
    }
  });
  run();
}

import type Database from "better-sqlite3";
import {
  KIT_FEATURE_REGISTRY_MIN_USER_VERSION,
  TASK_ENGINE_COMPONENTS_TABLE,
  TASK_ENGINE_FEATURES_TABLE,
  TASK_ENGINE_TASK_FEATURES_TABLE
} from "../../../core/state/feature-registry-migration.js";
import { loadKnownFeatureSlugsFromJsonFile } from "../feature-slug-validation.js";

type SqliteDatabase = InstanceType<typeof Database>;

export function readSqliteUserVersion(db: SqliteDatabase): number {
  const raw = db.pragma("user_version", { simple: true });
  return typeof raw === "number" ? raw : Number(raw);
}

export function featureRegistryActiveOnConnection(db: SqliteDatabase): boolean {
  return readSqliteUserVersion(db) >= KIT_FEATURE_REGISTRY_MIN_USER_VERSION;
}

export function loadTaskFeatureLinkMap(db: SqliteDatabase): Map<string, string[]> | null {
  if (!featureRegistryActiveOnConnection(db)) {
    return null;
  }
  const rows = db
    .prepare(`SELECT task_id, feature_id FROM ${TASK_ENGINE_TASK_FEATURES_TABLE} ORDER BY task_id ASC, feature_id ASC`)
    .all() as { task_id: string; feature_id: string }[];
  const m = new Map<string, string[]>();
  for (const r of rows) {
    const cur = m.get(r.task_id) ?? [];
    cur.push(r.feature_id);
    m.set(r.task_id, cur);
  }
  return m;
}

export function loadKnownFeatureSlugSetFromDb(db: SqliteDatabase): Set<string> | null {
  if (!featureRegistryActiveOnConnection(db)) {
    return null;
  }
  const rows = db.prepare(`SELECT id FROM ${TASK_ENGINE_FEATURES_TABLE}`).all() as { id: string }[];
  return new Set(rows.map((r) => r.id));
}

/** Known feature ids: registry when active, else taxonomy JSON (dev / tests). */
export function resolveKnownFeatureSlugSet(db: SqliteDatabase | null): Set<string> {
  if (db) {
    const fromDb = loadKnownFeatureSlugSetFromDb(db);
    if (fromDb && fromDb.size > 0) {
      return fromDb;
    }
  }
  return loadKnownFeatureSlugsFromJsonFile();
}

export type RegistryComponentRow = { id: string; displayName: string; sortOrder: number };

export function listRegistryComponents(db: SqliteDatabase): RegistryComponentRow[] {
  const rows = db
    .prepare(
      `SELECT id, display_name AS displayName, sort_order AS sortOrder FROM ${TASK_ENGINE_COMPONENTS_TABLE} ORDER BY sort_order ASC, id ASC`
    )
    .all() as RegistryComponentRow[];
  return rows;
}

export type RegistryFeatureRow = {
  id: string;
  componentId: string;
  name: string;
  covers: string;
};

export function listRegistryFeatures(db: SqliteDatabase, componentId?: string): RegistryFeatureRow[] {
  if (componentId && componentId.trim().length > 0) {
    return db
      .prepare(
        `SELECT id, component_id AS componentId, name, covers FROM ${TASK_ENGINE_FEATURES_TABLE} WHERE component_id = ? ORDER BY id ASC`
      )
      .all(componentId.trim()) as RegistryFeatureRow[];
  }
  return db
    .prepare(
      `SELECT id, component_id AS componentId, name, covers FROM ${TASK_ENGINE_FEATURES_TABLE} ORDER BY component_id ASC, id ASC`
    )
    .all() as RegistryFeatureRow[];
}

export function listFeatureIdsForComponent(db: SqliteDatabase, componentId: string): string[] {
  const rows = db
    .prepare(`SELECT id FROM ${TASK_ENGINE_FEATURES_TABLE} WHERE component_id = ?`)
    .all(componentId.trim()) as { id: string }[];
  return rows.map((r) => r.id);
}

export function replaceAllTaskFeatureLinks(db: SqliteDatabase, tasks: { id: string; features?: string[] }[]): void {
  db.prepare(`DELETE FROM ${TASK_ENGINE_TASK_FEATURES_TABLE}`).run();
  const ins = db.prepare(
    `INSERT INTO ${TASK_ENGINE_TASK_FEATURES_TABLE} (task_id, feature_id) VALUES (?,?)`
  );
  const run = db.transaction(() => {
    for (const t of tasks) {
      const slugs = t.features ?? [];
      for (const fid of slugs) {
        ins.run(t.id, fid);
      }
    }
  });
  run();
}

export type FeatureEnrichment = {
  slug: string;
  name: string;
  componentId: string;
  componentDisplayName: string;
};

/** Batch-resolve feature slugs for dashboard / extension rows (no N+1). */
export function buildFeatureEnrichmentBySlug(db: SqliteDatabase | null): Map<string, FeatureEnrichment> {
  const m = new Map<string, FeatureEnrichment>();
  if (!db || !featureRegistryActiveOnConnection(db)) {
    return m;
  }
  const rows = db
    .prepare(
      `SELECT f.id AS slug, f.name AS featureName, f.component_id AS componentId, c.display_name AS componentDisplayName
       FROM ${TASK_ENGINE_FEATURES_TABLE} f
       INNER JOIN ${TASK_ENGINE_COMPONENTS_TABLE} c ON c.id = f.component_id`
    )
    .all() as Array<{
      slug: string;
      featureName: string;
      componentId: string;
      componentDisplayName: string;
    }>;
  for (const r of rows) {
    m.set(r.slug, {
      slug: r.slug,
      name: r.featureName,
      componentId: r.componentId,
      componentDisplayName: r.componentDisplayName
    });
  }
  return m;
}

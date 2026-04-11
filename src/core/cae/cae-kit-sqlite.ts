/**
 * CAE persistence helpers against unified kit SQLite (ADR-cae-persistence-v1).
 */

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

import type { ModuleLifecycleContext } from "../../contracts/module-contract.js";
import { planningSqliteDatabaseRelativePath } from "../../modules/task-engine/planning-config.js";
import { prepareKitSqliteDatabase } from "../state/workspace-kit-sqlite.js";

type SqliteDatabase = InstanceType<typeof Database>;

function kitDbPath(workspacePath: string, effective: Record<string, unknown>): string {
  const rel = planningSqliteDatabaseRelativePath({
    workspacePath,
    effectiveConfig: effective
  } as ModuleLifecycleContext);
  return path.join(workspacePath, rel);
}

export function openKitSqliteReadWrite(
  workspacePath: string,
  effective: Record<string, unknown>
): SqliteDatabase | null {
  const abs = kitDbPath(workspacePath, effective);
  if (!fs.existsSync(abs)) {
    return null;
  }
  const db = new Database(abs);
  prepareKitSqliteDatabase(db);
  return db;
}

/** When persistence is on, write trace+bundle to kit SQLite (no-op if DB missing). */
export function persistCaeTraceIfEnabled(
  workspacePath: string,
  effective: Record<string, unknown>,
  persistenceEnabled: boolean,
  traceId: string,
  trace: Record<string, unknown>,
  bundle: Record<string, unknown>
): void {
  if (!persistenceEnabled) return;
  const db = openKitSqliteReadWrite(workspacePath, effective);
  if (!db) return;
  try {
    persistCaeTraceSnapshot(db, traceId, trace, bundle);
  } finally {
    db.close();
  }
}

export function persistCaeTraceSnapshot(
  db: SqliteDatabase,
  traceId: string,
  trace: Record<string, unknown>,
  bundle: Record<string, unknown>
): void {
  const now = new Date().toISOString();
  const traceJson = JSON.stringify(trace);
  const bundleJson = JSON.stringify(bundle);
  db.prepare(
    `INSERT OR REPLACE INTO cae_trace_snapshots (trace_id, trace_json, bundle_json, created_at) VALUES (?, ?, ?, ?)`
  ).run(traceId, traceJson, bundleJson, now);
  pruneCaeTraceSnapshots(db, 2000);
}

export function loadCaeTraceSnapshot(
  db: SqliteDatabase,
  traceId: string
): { trace: Record<string, unknown>; bundle: Record<string, unknown> } | null {
  const row = db
    .prepare(`SELECT trace_json, bundle_json FROM cae_trace_snapshots WHERE trace_id = ?`)
    .get(traceId) as { trace_json: string; bundle_json: string } | undefined;
  if (!row) return null;
  try {
    return {
      trace: JSON.parse(row.trace_json) as Record<string, unknown>,
      bundle: JSON.parse(row.bundle_json) as Record<string, unknown>
    };
  } catch {
    return null;
  }
}

export function pruneCaeTraceSnapshots(db: SqliteDatabase, maxRows: number): void {
  const n = db.prepare(`SELECT COUNT(*) AS c FROM cae_trace_snapshots`).get() as { c: number };
  const excess = Number(n.c) - maxRows;
  if (excess <= 0) return;
  db.prepare(
    `DELETE FROM cae_trace_snapshots WHERE trace_id IN (
       SELECT trace_id FROM cae_trace_snapshots ORDER BY created_at ASC LIMIT ?
     )`
  ).run(excess);
}

export function countCaeTraceRows(db: SqliteDatabase): number {
  try {
    const row = db.prepare(`SELECT COUNT(*) AS c FROM cae_trace_snapshots`).get() as { c: number };
    return Number(row.c) || 0;
  } catch {
    return 0;
  }
}

export function countCaeAckRows(db: SqliteDatabase): number {
  try {
    const row = db.prepare(`SELECT COUNT(*) AS c FROM cae_ack_satisfaction`).get() as { c: number };
    return Number(row.c) || 0;
  } catch {
    return 0;
  }
}

export function insertCaeAckSatisfaction(
  db: SqliteDatabase,
  row: { traceId: string; ackToken: string; activationId: string; actor: string }
): void {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO cae_ack_satisfaction (trace_id, ack_token, activation_id, satisfied_at, actor) VALUES (?, ?, ?, ?, ?)`
  ).run(row.traceId, row.ackToken, row.activationId, now, row.actor);
}

// --- CAE registry (SQLite authoritative rows, Phase 70 / T889) ---

export type CaeRegistryArtifactDbRow = {
  version_id: string;
  artifact_id: string;
  artifact_type: string;
  path: string;
  title: string | null;
  description: string | null;
  metadata_json: string;
  retired_at: string | null;
};

export type CaeRegistryActivationDbRow = {
  version_id: string;
  activation_id: string;
  family: string;
  priority: number;
  lifecycle_state: string;
  scope_json: string;
  artifact_refs_json: string;
  acknowledgement_json: string | null;
  metadata_json: string;
  retired_at: string | null;
};

/** True when `cae_registry_versions` exists (post kit SQLite v12 migration). */
export function caeRegistryTablesReady(db: SqliteDatabase): boolean {
  try {
    db.prepare(`SELECT 1 FROM cae_registry_versions LIMIT 1`).get();
    return true;
  } catch {
    return false;
  }
}

/** Active version id, or null when none is marked active. */
export function getActiveCaeRegistryVersionId(db: SqliteDatabase): string | null {
  try {
    const row = db
      .prepare(
        `SELECT version_id FROM cae_registry_versions WHERE is_active = 1 ORDER BY created_at DESC LIMIT 1`
      )
      .get() as { version_id: string } | undefined;
    return row?.version_id ?? null;
  } catch {
    return null;
  }
}

export function listCaeRegistryVersionIds(db: SqliteDatabase): string[] {
  try {
    const rows = db
      .prepare(`SELECT version_id FROM cae_registry_versions ORDER BY created_at DESC`)
      .all() as { version_id: string }[];
    return rows.map((r) => r.version_id);
  } catch {
    return [];
  }
}

/**
 * Insert a registry version row. When `setActive` is true, clears other active flags first
 * (at most one active version).
 */
export function insertCaeRegistryVersion(
  db: SqliteDatabase,
  row: { versionId: string; createdBy: string; note?: string | null; setActive?: boolean }
): void {
  const now = new Date().toISOString();
  const run = db.transaction(() => {
    if (row.setActive) {
      db.prepare(`UPDATE cae_registry_versions SET is_active = 0`).run();
    }
    db.prepare(
      `INSERT INTO cae_registry_versions (version_id, created_at, created_by, is_active, note) VALUES (?, ?, ?, ?, ?)`
    ).run(row.versionId, now, row.createdBy, row.setActive ? 1 : 0, row.note ?? null);
  });
  run();
}

/** Mark `versionId` active; returns false if the version row does not exist. */
export function activateCaeRegistryVersion(db: SqliteDatabase, versionId: string): boolean {
  try {
    const exists = db.prepare(`SELECT 1 FROM cae_registry_versions WHERE version_id = ?`).get(versionId);
    if (!exists) return false;
    const run = db.transaction(() => {
      db.prepare(`UPDATE cae_registry_versions SET is_active = 0`).run();
      db.prepare(`UPDATE cae_registry_versions SET is_active = 1 WHERE version_id = ?`).run(versionId);
    });
    run();
    return true;
  } catch {
    return false;
  }
}

export function listCaeRegistryArtifactsForVersion(
  db: SqliteDatabase,
  versionId: string
): CaeRegistryArtifactDbRow[] {
  try {
    return db
      .prepare(
        `SELECT version_id, artifact_id, artifact_type, path, title, description, metadata_json, retired_at
         FROM cae_registry_artifacts WHERE version_id = ? ORDER BY artifact_id ASC`
      )
      .all(versionId) as CaeRegistryArtifactDbRow[];
  } catch {
    return [];
  }
}

export function listCaeRegistryActivationsForVersion(
  db: SqliteDatabase,
  versionId: string
): CaeRegistryActivationDbRow[] {
  try {
    return db
      .prepare(
        `SELECT version_id, activation_id, family, priority, lifecycle_state, scope_json, artifact_refs_json,
                acknowledgement_json, metadata_json, retired_at
         FROM cae_registry_activations WHERE version_id = ? ORDER BY activation_id ASC`
      )
      .all(versionId) as CaeRegistryActivationDbRow[];
  } catch {
    return [];
  }
}

export function insertCaeRegistryArtifactRow(
  db: SqliteDatabase,
  row: {
    versionId: string;
    artifactId: string;
    artifactType: string;
    path: string;
    title?: string | null;
    description?: string | null;
    metadataJson?: string;
    retiredAt?: string | null;
  }
): void {
  db.prepare(
    `INSERT INTO cae_registry_artifacts (
       version_id, artifact_id, artifact_type, path, title, description, metadata_json, retired_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    row.versionId,
    row.artifactId,
    row.artifactType,
    row.path,
    row.title ?? null,
    row.description ?? null,
    row.metadataJson ?? "{}",
    row.retiredAt ?? null
  );
}

export function insertCaeRegistryActivationRow(
  db: SqliteDatabase,
  row: {
    versionId: string;
    activationId: string;
    family: string;
    priority: number;
    lifecycleState: string;
    scopeJson: string;
    artifactRefsJson: string;
    acknowledgementJson?: string | null;
    metadataJson?: string;
    retiredAt?: string | null;
  }
): void {
  db.prepare(
    `INSERT INTO cae_registry_activations (
       version_id, activation_id, family, priority, lifecycle_state, scope_json, artifact_refs_json,
       acknowledgement_json, metadata_json, retired_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    row.versionId,
    row.activationId,
    row.family,
    row.priority,
    row.lifecycleState,
    row.scopeJson,
    row.artifactRefsJson,
    row.acknowledgementJson ?? null,
    row.metadataJson ?? "{}",
    row.retiredAt ?? null
  );
}

/** Remove all artifact + activation rows for a version (keeps the version header row). */
export function clearCaeRegistryVersionContents(db: SqliteDatabase, versionId: string): void {
  const run = db.transaction(() => {
    db.prepare(`DELETE FROM cae_registry_activations WHERE version_id = ?`).run(versionId);
    db.prepare(`DELETE FROM cae_registry_artifacts WHERE version_id = ?`).run(versionId);
  });
  run();
}

/**
 * Delete a version row when it is not active (children removed by FK CASCADE).
 * Returns false when missing or still active.
 */
export function deleteInactiveCaeRegistryVersion(db: SqliteDatabase, versionId: string): boolean {
  const row = db
    .prepare(`SELECT is_active FROM cae_registry_versions WHERE version_id = ?`)
    .get(versionId) as { is_active: number } | undefined;
  if (!row || row.is_active === 1) return false;
  db.prepare(`DELETE FROM cae_registry_versions WHERE version_id = ?`).run(versionId);
  return true;
}

export type CaeRegistryVersionMetaRow = {
  version_id: string;
  created_at: string;
  created_by: string;
  is_active: number;
  note: string | null;
};

export function getCaeRegistryVersionMeta(
  db: SqliteDatabase,
  versionId: string
): CaeRegistryVersionMetaRow | null {
  try {
    const row = db
      .prepare(
        `SELECT version_id, created_at, created_by, is_active, note FROM cae_registry_versions WHERE version_id = ?`
      )
      .get(versionId) as CaeRegistryVersionMetaRow | undefined;
    return row ?? null;
  } catch {
    return null;
  }
}

export type CaeRegistryVersionListRow = CaeRegistryVersionMetaRow & {
  artifact_count: number;
  activation_count: number;
};

export function listCaeRegistryVersionsWithCounts(db: SqliteDatabase): CaeRegistryVersionListRow[] {
  try {
    return db
      .prepare(
        `SELECT v.version_id, v.created_at, v.created_by, v.is_active, v.note,
            (SELECT COUNT(*) FROM cae_registry_artifacts a WHERE a.version_id = v.version_id) AS artifact_count,
            (SELECT COUNT(*) FROM cae_registry_activations c WHERE c.version_id = v.version_id) AS activation_count
         FROM cae_registry_versions v
         ORDER BY v.created_at DESC`
      )
      .all() as CaeRegistryVersionListRow[];
  } catch {
    return [];
  }
}

/** Append-only CAE registry mutation audit (kit SQLite v13+). */
export function insertCaeRegistryMutationAudit(
  db: SqliteDatabase,
  row: {
    actor: string;
    commandName: string;
    versionId: string;
    note?: string | null;
    payload?: Record<string, unknown>;
  }
): void {
  const now = new Date().toISOString();
  const payloadJson = JSON.stringify(row.payload ?? {});
  try {
    db.prepare(
      `INSERT INTO cae_registry_mutations (recorded_at, actor, command_name, version_id, note, payload_json)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(now, row.actor, row.commandName, row.versionId, row.note ?? null, payloadJson);
  } catch {
    /* pre-v13 DB or missing table — skip audit rather than failing the mutation */
  }
}

export function updateCaeRegistryArtifactFields(
  db: SqliteDatabase,
  versionId: string,
  artifactId: string,
  patch: {
    artifactType?: string;
    path?: string;
    title?: string | null;
    description?: string | null;
    metadataJson?: string;
  }
): boolean {
  const fields: string[] = [];
  const vals: unknown[] = [];
  if (patch.artifactType !== undefined) {
    fields.push("artifact_type = ?");
    vals.push(patch.artifactType);
  }
  if (patch.path !== undefined) {
    fields.push("path = ?");
    vals.push(patch.path);
  }
  if (patch.title !== undefined) {
    fields.push("title = ?");
    vals.push(patch.title);
  }
  if (patch.description !== undefined) {
    fields.push("description = ?");
    vals.push(patch.description);
  }
  if (patch.metadataJson !== undefined) {
    fields.push("metadata_json = ?");
    vals.push(patch.metadataJson);
  }
  if (!fields.length) return false;
  vals.push(versionId, artifactId);
  const sql = `UPDATE cae_registry_artifacts SET ${fields.join(", ")} WHERE version_id = ? AND artifact_id = ?`;
  const res = db.prepare(sql).run(...vals);
  return res.changes > 0;
}

export function retireCaeRegistryArtifact(
  db: SqliteDatabase,
  versionId: string,
  artifactId: string,
  retiredAt?: string
): boolean {
  const ts = retiredAt ?? new Date().toISOString();
  const res = db
    .prepare(
      `UPDATE cae_registry_artifacts SET retired_at = ? WHERE version_id = ? AND artifact_id = ? AND retired_at IS NULL`
    )
    .run(ts, versionId, artifactId);
  return res.changes > 0;
}

export function updateCaeRegistryActivationFields(
  db: SqliteDatabase,
  versionId: string,
  activationId: string,
  patch: {
    family?: string;
    priority?: number;
    lifecycleState?: string;
    scopeJson?: string;
    artifactRefsJson?: string;
    acknowledgementJson?: string | null;
    metadataJson?: string;
  }
): boolean {
  const fields: string[] = [];
  const vals: unknown[] = [];
  if (patch.family !== undefined) {
    fields.push("family = ?");
    vals.push(patch.family);
  }
  if (patch.priority !== undefined) {
    fields.push("priority = ?");
    vals.push(patch.priority);
  }
  if (patch.lifecycleState !== undefined) {
    fields.push("lifecycle_state = ?");
    vals.push(patch.lifecycleState);
  }
  if (patch.scopeJson !== undefined) {
    fields.push("scope_json = ?");
    vals.push(patch.scopeJson);
  }
  if (patch.artifactRefsJson !== undefined) {
    fields.push("artifact_refs_json = ?");
    vals.push(patch.artifactRefsJson);
  }
  if (patch.acknowledgementJson !== undefined) {
    fields.push("acknowledgement_json = ?");
    vals.push(patch.acknowledgementJson);
  }
  if (patch.metadataJson !== undefined) {
    fields.push("metadata_json = ?");
    vals.push(patch.metadataJson);
  }
  if (!fields.length) return false;
  vals.push(versionId, activationId);
  const sql = `UPDATE cae_registry_activations SET ${fields.join(", ")} WHERE version_id = ? AND activation_id = ?`;
  const res = db.prepare(sql).run(...vals);
  return res.changes > 0;
}

export function retireCaeRegistryActivation(
  db: SqliteDatabase,
  versionId: string,
  activationId: string,
  retiredAt?: string
): boolean {
  const ts = retiredAt ?? new Date().toISOString();
  const res = db
    .prepare(
      `UPDATE cae_registry_activations SET retired_at = ? WHERE version_id = ? AND activation_id = ? AND retired_at IS NULL`
    )
    .run(ts, versionId, activationId);
  return res.changes > 0;
}

/**
 * Copy artifact + activation rows from one version to another (used by clone).
 * Target version must already exist as a header row with no children (or caller cleared it).
 */
export function copyCaeRegistryVersionContents(
  db: SqliteDatabase,
  fromVersionId: string,
  toVersionId: string
): void {
  const arts = listCaeRegistryArtifactsForVersion(db, fromVersionId);
  for (const r of arts) {
    insertCaeRegistryArtifactRow(db, {
      versionId: toVersionId,
      artifactId: r.artifact_id,
      artifactType: r.artifact_type,
      path: r.path,
      title: r.title,
      description: r.description,
      metadataJson: r.metadata_json,
      retiredAt: r.retired_at
    });
  }
  const acts = listCaeRegistryActivationsForVersion(db, fromVersionId);
  for (const r of acts) {
    insertCaeRegistryActivationRow(db, {
      versionId: toVersionId,
      activationId: r.activation_id,
      family: r.family,
      priority: r.priority,
      lifecycleState: r.lifecycle_state,
      scopeJson: r.scope_json,
      artifactRefsJson: r.artifact_refs_json,
      acknowledgementJson: r.acknowledgement_json,
      metadataJson: r.metadata_json,
      retiredAt: r.retired_at
    });
  }
}

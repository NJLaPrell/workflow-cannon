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

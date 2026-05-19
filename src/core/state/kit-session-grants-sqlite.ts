import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import type { ModuleLifecycleContext } from "../../contracts/module-contract.js";
import type { PolicyOperationId } from "../policy.js";
import type { SessionPolicyGrant } from "../session-policy.js";
import { SESSION_POLICY_SCHEMA_VERSION } from "../session-policy.js";
import { planningSqliteDatabaseRelativePath } from "../../modules/task-engine/planning-config.js";
import { prepareKitSqliteDatabase } from "./kit-sqlite/planning-sqlite-kernel.js";

export const SESSION_GRANTS_JSON_REL = ".workspace-kit/policy/session-grants.json";
export const SESSION_GRANTS_MIGRATED_SUFFIX = ".migrated";

export type SessionGrantRow = {
  sessionId: string;
  operationId: PolicyOperationId;
  rationale: string;
  grantedAt: string;
  expiresAt: string | null;
};

function openDb(workspacePath: string, effectiveConfig?: Record<string, unknown>): Database.Database {
  const ctx = { workspacePath, effectiveConfig } as ModuleLifecycleContext;
  const dbRel = planningSqliteDatabaseRelativePath(ctx);
  const dbPath = path.resolve(workspacePath, dbRel);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  prepareKitSqliteDatabase(db);
  return db;
}

function archiveJson(workspacePath: string): void {
  const abs = path.join(workspacePath, SESSION_GRANTS_JSON_REL);
  if (!fs.existsSync(abs)) {
    return;
  }
  try {
    fs.renameSync(abs, `${abs}${SESSION_GRANTS_MIGRATED_SUFFIX}`);
  } catch {
    /* best-effort */
  }
}

export function importSessionGrantsJsonIfNeeded(
  db: Database.Database,
  workspacePath: string
): number {
  const count = (db.prepare("SELECT COUNT(*) AS c FROM kit_session_grants").get() as { c: number }).c;
  if (count > 0) {
    return 0;
  }
  const abs = path.join(workspacePath, SESSION_GRANTS_JSON_REL);
  if (!fs.existsSync(abs)) {
    return 0;
  }
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(fs.readFileSync(abs, "utf8")) as Record<string, unknown>;
  } catch {
    archiveJson(workspacePath);
    return 0;
  }
  if (raw.schemaVersion !== SESSION_POLICY_SCHEMA_VERSION) {
    archiveJson(workspacePath);
    return 0;
  }
  const sessionId = typeof raw.sessionId === "string" ? raw.sessionId : "default";
  const grants = raw.grants;
  const insert = db.prepare(
    `INSERT OR REPLACE INTO kit_session_grants
      (session_id, operation_id, rationale, granted_at, expires_at)
     VALUES (@session_id, @operation_id, @rationale, @granted_at, NULL)`
  );
  let imported = 0;
  if (grants && typeof grants === "object" && !Array.isArray(grants)) {
    for (const [operationId, value] of Object.entries(grants)) {
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      const g = value as Record<string, unknown>;
      const rationale = typeof g.rationale === "string" ? g.rationale : "";
      const grantedAt = typeof g.grantedAt === "string" ? g.grantedAt : new Date().toISOString();
      if (!rationale) continue;
      insert.run({
        session_id: sessionId,
        operation_id: operationId,
        rationale,
        granted_at: grantedAt
      });
      imported += 1;
    }
  }
  archiveJson(workspacePath);
  return imported;
}

export function getSessionGrantRow(
  workspacePath: string,
  operationId: PolicyOperationId,
  sessionId: string,
  effectiveConfig?: Record<string, unknown>
): SessionPolicyGrant | undefined {
  const db = openDb(workspacePath, effectiveConfig);
  try {
    importSessionGrantsJsonIfNeeded(db, workspacePath);
    const row = db
      .prepare(
        `SELECT rationale, granted_at, expires_at FROM kit_session_grants
         WHERE session_id = ? AND operation_id = ?
           AND (expires_at IS NULL OR expires_at > datetime('now'))`
      )
      .get(sessionId, operationId) as
      | { rationale: string; granted_at: string; expires_at: string | null }
      | undefined;
    if (!row) return undefined;
    return { rationale: row.rationale, grantedAt: row.granted_at };
  } finally {
    db.close();
  }
}

export function upsertSessionGrantRow(
  workspacePath: string,
  operationId: PolicyOperationId,
  sessionId: string,
  rationale: string,
  effectiveConfig?: Record<string, unknown>
): void {
  const db = openDb(workspacePath, effectiveConfig);
  try {
    importSessionGrantsJsonIfNeeded(db, workspacePath);
    db.prepare(
      `INSERT INTO kit_session_grants (session_id, operation_id, rationale, granted_at, expires_at)
       VALUES (@session_id, @operation_id, @rationale, @granted_at, NULL)
       ON CONFLICT(session_id, operation_id) DO UPDATE SET
         rationale = excluded.rationale,
         granted_at = excluded.granted_at,
         expires_at = excluded.expires_at`
    ).run({
      session_id: sessionId,
      operation_id: operationId,
      rationale,
      granted_at: new Date().toISOString()
    });
  } finally {
    db.close();
  }
}

export function listSessionGrantRows(
  workspacePath: string,
  effectiveConfig?: Record<string, unknown>,
  sessionId?: string
): SessionGrantRow[] {
  const db = openDb(workspacePath, effectiveConfig);
  try {
    importSessionGrantsJsonIfNeeded(db, workspacePath);
    type GrantDbRow = {
      session_id: string;
      operation_id: string;
      rationale: string;
      granted_at: string;
      expires_at: string | null;
    };
    const rows = (sessionId
      ? db.prepare(
          `SELECT session_id, operation_id, rationale, granted_at, expires_at
           FROM kit_session_grants WHERE session_id = ?
           ORDER BY granted_at ASC`
        ).all(sessionId)
      : db.prepare(
          `SELECT session_id, operation_id, rationale, granted_at, expires_at
           FROM kit_session_grants ORDER BY session_id ASC, granted_at ASC`
        ).all()) as GrantDbRow[];
    return rows.map((row) => ({
      sessionId: row.session_id,
      operationId: row.operation_id as PolicyOperationId,
      rationale: row.rationale,
      grantedAt: row.granted_at,
      expiresAt: row.expires_at ?? null
    }));
  } finally {
    db.close();
  }
}

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import type { ModuleLifecycleContext } from "../../contracts/module-contract.js";
import type { PolicyTraceRecord, PolicyTraceRecordInput } from "../policy.js";
import { POLICY_TRACE_SCHEMA_VERSION } from "../policy.js";
import { planningSqliteDatabaseRelativePath } from "../../modules/task-engine/planning-config.js";
import { prepareKitSqliteDatabase } from "./kit-sqlite/planning-sqlite-kernel.js";

export const POLICY_TRACES_JSONL_REL = ".workspace-kit/policy/traces.jsonl";
export const POLICY_TRACES_MIGRATED_SUFFIX = ".migrated";

export type PolicyTraceRow = PolicyTraceRecord & { id: number };

export function openKitPolicyTraceDatabase(
  workspacePath: string,
  effectiveConfig?: Record<string, unknown>
): Database.Database {
  const ctx = { workspacePath, effectiveConfig } as ModuleLifecycleContext;
  const dbRel = planningSqliteDatabaseRelativePath(ctx);
  const dbPath = path.resolve(workspacePath, dbRel);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  prepareKitSqliteDatabase(db);
  return db;
}

function archiveJsonl(workspacePath: string, relativePath: string): void {
  const abs = path.join(workspacePath, relativePath);
  if (!fs.existsSync(abs)) {
    return;
  }
  const archived = `${abs}${POLICY_TRACES_MIGRATED_SUFFIX}`;
  try {
    fs.renameSync(abs, archived);
  } catch {
    /* best-effort */
  }
}

function rowToRecord(row: {
  id: number;
  schema_version: number;
  recorded_at: string;
  operation_id: string;
  command: string;
  actor: string;
  allowed: number;
  rationale: string | null;
  command_ok: number | null;
  message: string | null;
}): PolicyTraceRow {
  return {
    id: row.id,
    schemaVersion: row.schema_version,
    timestamp: row.recorded_at,
    operationId: row.operation_id as PolicyTraceRecord["operationId"],
    command: row.command,
    actor: row.actor,
    allowed: row.allowed === 1,
    rationale: row.rationale ?? undefined,
    commandOk: row.command_ok === null ? undefined : row.command_ok === 1,
    message: row.message ?? undefined
  };
}

/** Import legacy traces.jsonl once when the table is empty. */
export function importPolicyTracesJsonlIfNeeded(db: Database.Database, workspacePath: string): number {
  const count = (db.prepare("SELECT COUNT(*) AS c FROM kit_policy_traces").get() as { c: number }).c;
  if (count > 0) {
    return 0;
  }
  const abs = path.join(workspacePath, POLICY_TRACES_JSONL_REL);
  if (!fs.existsSync(abs)) {
    return 0;
  }
  const insert = db.prepare(
    `INSERT INTO kit_policy_traces
      (schema_version, recorded_at, operation_id, command, actor, allowed, rationale, command_ok, message)
     VALUES (@schema_version, @recorded_at, @operation_id, @command, @actor, @allowed, @rationale, @command_ok, @message)`
  );
  let imported = 0;
  const raw = fs.readFileSync(abs, "utf8");
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      const rec = JSON.parse(t) as Record<string, unknown>;
      insert.run({
        schema_version:
          typeof rec.schemaVersion === "number" ? rec.schemaVersion : POLICY_TRACE_SCHEMA_VERSION,
        recorded_at: String(rec.timestamp ?? new Date().toISOString()),
        operation_id: String(rec.operationId ?? "unknown"),
        command: String(rec.command ?? ""),
        actor: String(rec.actor ?? ""),
        allowed: rec.allowed === false ? 0 : 1,
        rationale: typeof rec.rationale === "string" ? rec.rationale : null,
        command_ok: typeof rec.commandOk === "boolean" ? (rec.commandOk ? 1 : 0) : null,
        message: typeof rec.message === "string" ? rec.message : null
      });
      imported += 1;
    } catch {
      /* skip bad line */
    }
  }
  if (imported > 0) {
    archiveJsonl(workspacePath, POLICY_TRACES_JSONL_REL);
  }
  return imported;
}

export function appendPolicyTraceRow(
  db: Database.Database,
  record: PolicyTraceRecordInput
): number {
  const full: PolicyTraceRecord = {
    ...record,
    schemaVersion: record.schemaVersion ?? POLICY_TRACE_SCHEMA_VERSION
  };
  const result = db
    .prepare(
      `INSERT INTO kit_policy_traces
        (schema_version, recorded_at, operation_id, command, actor, allowed, rationale, command_ok, message)
       VALUES (@schema_version, @recorded_at, @operation_id, @command, @actor, @allowed, @rationale, @command_ok, @message)`
    )
    .run({
      schema_version: full.schemaVersion,
      recorded_at: full.timestamp,
      operation_id: full.operationId,
      command: full.command,
      actor: full.actor,
      allowed: full.allowed ? 1 : 0,
      rationale: full.rationale ?? null,
      command_ok: typeof full.commandOk === "boolean" ? (full.commandOk ? 1 : 0) : null,
      message: full.message ?? null
    });
  return Number(result.lastInsertRowid);
}

export function listPolicyTracesAfterId(
  db: Database.Database,
  afterId: number
): PolicyTraceRow[] {
  const rows = db
    .prepare(
      `SELECT id, schema_version, recorded_at, operation_id, command, actor, allowed, rationale, command_ok, message
       FROM kit_policy_traces WHERE id > ? ORDER BY id ASC`
    )
    .all(afterId) as Array<{
    id: number;
    schema_version: number;
    recorded_at: string;
    operation_id: string;
    command: string;
    actor: string;
    allowed: number;
    rationale: string | null;
    command_ok: number | null;
    message: string | null;
  }>;
  return rows.map(rowToRecord);
}

/** Map legacy line cursor (lines already ingested) to the last ingested trace row id. */
export function resolvePolicyTraceIdFromLineCursor(
  workspacePath: string,
  lineCursor: number,
  effectiveConfig?: Record<string, unknown>
): number {
  if (lineCursor <= 0) {
    return 0;
  }
  const db = openKitPolicyTraceDatabase(workspacePath, effectiveConfig);
  try {
    importPolicyTracesJsonlIfNeeded(db, workspacePath);
    const row = db
      .prepare(
        `SELECT id FROM kit_policy_traces ORDER BY id ASC LIMIT 1 OFFSET ?`
      )
      .get(lineCursor - 1) as { id: number } | undefined;
    return row?.id ?? 0;
  } finally {
    db.close();
  }
}

export function readPolicyTracesAfterId(
  workspacePath: string,
  afterId: number,
  effectiveConfig?: Record<string, unknown>
): PolicyTraceRow[] {
  const db = openKitPolicyTraceDatabase(workspacePath, effectiveConfig);
  try {
    importPolicyTracesJsonlIfNeeded(db, workspacePath);
    return listPolicyTracesAfterId(db, afterId);
  } finally {
    db.close();
  }
}

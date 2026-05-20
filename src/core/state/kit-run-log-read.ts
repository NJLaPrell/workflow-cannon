import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import type { ModuleLifecycleContext } from "../../contracts/module-contract.js";
import { planningSqliteDatabaseRelativePath } from "../../modules/task-engine/planning-config.js";
import { prepareKitSqliteDatabase } from "./kit-sqlite/planning-sqlite-kernel.js";

export type RunLogRow = {
  invocationId: string;
  command: string;
  args: Record<string, unknown>;
  response: Record<string, unknown>;
  startedAt: string;
  finishedAt: string;
  ok: boolean;
  code: string;
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

function tableExists(db: Database.Database, name: string): boolean {
  const row = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(name) as { 1: number } | undefined;
  return row !== undefined;
}

function parseJsonObject(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    /* fall through */
  }
  return {};
}

function mapRow(row: {
  invocation_id: string;
  command: string;
  args_redacted_json: string;
  response_redacted_json: string;
  started_at: string;
  finished_at: string;
  ok: number;
  code: string;
}): RunLogRow {
  return {
    invocationId: row.invocation_id,
    command: row.command,
    args: parseJsonObject(row.args_redacted_json),
    response: parseJsonObject(row.response_redacted_json),
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    ok: row.ok === 1,
    code: row.code
  };
}

export function readRunLogByInvocationId(args: {
  workspacePath: string;
  effectiveConfig?: Record<string, unknown>;
  invocationId: string;
}): RunLogRow | null {
  const db = openDb(args.workspacePath, args.effectiveConfig);
  try {
    if (!tableExists(db, "kit_run_log")) {
      return null;
    }
    const row = db
      .prepare(
        `SELECT invocation_id, command, args_redacted_json, response_redacted_json,
                started_at, finished_at, ok, code
         FROM kit_run_log WHERE invocation_id = ?`
      )
      .get(args.invocationId) as
      | {
          invocation_id: string;
          command: string;
          args_redacted_json: string;
          response_redacted_json: string;
          started_at: string;
          finished_at: string;
          ok: number;
          code: string;
        }
      | undefined;
    return row ? mapRow(row) : null;
  } finally {
    db.close();
  }
}

export function readLatestRunLogRow(args: {
  workspacePath: string;
  effectiveConfig?: Record<string, unknown>;
}): RunLogRow | null {
  const db = openDb(args.workspacePath, args.effectiveConfig);
  try {
    if (!tableExists(db, "kit_run_log")) {
      return null;
    }
    const row = db
      .prepare(
        `SELECT invocation_id, command, args_redacted_json, response_redacted_json,
                started_at, finished_at, ok, code
         FROM kit_run_log ORDER BY finished_at DESC, id DESC LIMIT 1`
      )
      .get() as
      | {
          invocation_id: string;
          command: string;
          args_redacted_json: string;
          response_redacted_json: string;
          started_at: string;
          finished_at: string;
          ok: number;
          code: string;
        }
      | undefined;
    return row ? mapRow(row) : null;
  } finally {
    db.close();
  }
}

export function isRunLogTableAvailable(
  workspacePath: string,
  effectiveConfig?: Record<string, unknown>
): boolean {
  const db = openDb(workspacePath, effectiveConfig);
  try {
    return tableExists(db, "kit_run_log");
  } finally {
    db.close();
  }
}

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import type { ModuleLifecycleContext } from "../../contracts/module-contract.js";
import { redactRunLogValue } from "../run-log-redaction.js";
import { getAtPath } from "../workspace-kit-config.js";
import { planningSqliteDatabaseRelativePath } from "../../modules/task-engine/planning-config.js";
import { prepareKitSqliteDatabase } from "./kit-sqlite/planning-sqlite-kernel.js";

export const DEFAULT_RUN_LOG_MAX_ROWS = 200;

function openDb(workspacePath: string, effectiveConfig?: Record<string, unknown>): Database.Database {
  const ctx = { workspacePath, effectiveConfig } as ModuleLifecycleContext;
  const dbRel = planningSqliteDatabaseRelativePath(ctx);
  const dbPath = path.resolve(workspacePath, dbRel);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  prepareKitSqliteDatabase(db);
  return db;
}

export function resolveRunLogMaxRows(effectiveConfig?: Record<string, unknown>): number {
  const raw = getAtPath(effectiveConfig ?? {}, "kit.runLog.maxRows");
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
    return Math.floor(raw);
  }
  return DEFAULT_RUN_LOG_MAX_ROWS;
}

export function appendRunLogRow(args: {
  workspacePath: string;
  effectiveConfig?: Record<string, unknown>;
  invocationId: string;
  command: string;
  commandArgs: Record<string, unknown>;
  response: Record<string, unknown>;
  startedAt: string;
  finishedAt: string;
}): void {
  const db = openDb(args.workspacePath, args.effectiveConfig);
  try {
    const argsRedacted = JSON.stringify(redactRunLogValue(args.commandArgs));
    const responseRedacted = JSON.stringify(redactRunLogValue(args.response));
    const ok = args.response.ok === true ? 1 : 0;
    const code = typeof args.response.code === "string" ? args.response.code : "";
    db.prepare(
      `INSERT INTO kit_run_log
        (invocation_id, command, args_redacted_json, response_redacted_json, started_at, finished_at, ok, code)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      args.invocationId,
      args.command,
      argsRedacted,
      responseRedacted,
      args.startedAt,
      args.finishedAt,
      ok,
      code
    );
    const maxRows = resolveRunLogMaxRows(args.effectiveConfig);
    const excess = (
      db.prepare("SELECT COUNT(*) AS c FROM kit_run_log").get() as { c: number }
    ).c - maxRows;
    if (excess > 0) {
      db.prepare(
        `DELETE FROM kit_run_log WHERE id IN (
           SELECT id FROM kit_run_log ORDER BY id ASC LIMIT ?
         )`
      ).run(excess);
    }
  } finally {
    db.close();
  }
}

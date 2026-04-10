/**
 * Bounded read of planning SQLite for CAE queue slice (ready-task depth).
 */

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

import type { ModuleLifecycleContext } from "../../contracts/module-contract.js";
import { planningSqliteDatabaseRelativePath } from "../../modules/task-engine/planning-config.js";

/**
 * Count non-archived `ready` tasks in relational task table; 0 if DB missing or table absent.
 */
export function countReadyTasksInPlanningSqlite(
  workspacePath: string,
  effective: Record<string, unknown>
): number {
  const rel = planningSqliteDatabaseRelativePath({
    workspacePath,
    effectiveConfig: effective
  } as ModuleLifecycleContext);
  const abs = path.join(workspacePath, rel);
  if (!fs.existsSync(abs)) {
    return 0;
  }
  const db = new Database(abs, { readonly: true });
  try {
    const row = db
      .prepare(
        `SELECT COUNT(*) AS c FROM sqlite_master WHERE type='table' AND name='task_engine_tasks'`
      )
      .get() as { c: number } | undefined;
    if (!row?.c) return 0;
    const c = db
      .prepare(
        `SELECT COUNT(*) AS c FROM task_engine_tasks WHERE status = 'ready' AND archived = 0`
      )
      .get() as { c: number };
    return Math.min(100_000, Math.max(0, Number(c.c) || 0));
  } catch {
    return 0;
  } finally {
    db.close();
  }
}

/**
 * Bounded read of planning SQLite for CAE queue slice (ready-task depth).
 */

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

import type { ModuleLifecycleContext } from "../../contracts/module-contract.js";
import { planningSqliteDatabaseRelativePath } from "../../modules/task-engine/planning-config.js";

/** Bounded deterministic slice for draft-impact blast-radius sampling */
export type ImpactPreviewPlanningTaskRow = {
  id: string;
  status: string;
  phaseKey: string | null;
};

/**
 * List up to `limit` non-archived `ready`/`in-progress` tasks for deterministic CAE preview matrices.
 * Prefer rows whose `phase_key` matches `currentPhaseKey` when supplied. Read-only — returns [] if DB absent.
 */
export function listImpactPreviewPlanningTasks(
  workspacePath: string,
  effective: Record<string, unknown>,
  opts?: { currentPhaseKey?: string; limit?: number }
): ImpactPreviewPlanningTaskRow[] {
  const limit = Math.min(12, Math.max(1, opts?.limit ?? 6));
  const rel = planningSqliteDatabaseRelativePath({
    workspacePath,
    effectiveConfig: effective
  } as ModuleLifecycleContext);
  const abs = path.join(workspacePath, rel);
  if (!fs.existsSync(abs)) {
    return [];
  }
  const db = new Database(abs, { readonly: true });
  try {
    const row = db
      .prepare(
        `SELECT COUNT(*) AS c FROM sqlite_master WHERE type='table' AND name='task_engine_tasks'`
      )
      .get() as { c: number } | undefined;
    if (!row?.c) return [];
    const phaseKey = typeof opts?.currentPhaseKey === "string" ? opts.currentPhaseKey.trim() : "";
    const stmt = db.prepare(
      `SELECT id, status, phase_key
       FROM task_engine_tasks
       WHERE archived = 0 AND status IN ('ready', 'in_progress')
       ORDER BY
         CASE status WHEN 'in_progress' THEN 0 ELSE 1 END,
         CASE WHEN ? != '' AND phase_key = ? THEN 0 ELSE 1 END,
         id
       LIMIT ?`
    );
    const rows = stmt.all(phaseKey, phaseKey, limit) as Array<{
      id: string;
      status: string;
      phase_key: string | null;
    }>;
    return rows.map((r) => ({
      id: String(r.id),
      status: String(r.status),
      phaseKey: r.phase_key == null ? null : String(r.phase_key)
    }));
  } catch {
    return [];
  } finally {
    db.close();
  }
}

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

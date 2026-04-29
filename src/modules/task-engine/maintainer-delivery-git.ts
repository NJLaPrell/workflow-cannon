import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type DatabaseCtor from "better-sqlite3";
import { TASK_ENGINE_TASKS_TABLE } from "../../core/state/workspace-kit-sqlite.js";

export type GitWorkingTreeSnapshot = {
  available: boolean;
  branch: string | null;
  isDirty: boolean;
  reason?: string;
};

export function readGitWorkingTreeSnapshot(cwd: string): GitWorkingTreeSnapshot {
  const inside = spawnSync("git", ["-C", cwd, "rev-parse", "--is-inside-work-tree"], {
    encoding: "utf8"
  });
  if (inside.status !== 0 || inside.stdout.trim() !== "true") {
    return { available: false, branch: null, isDirty: false, reason: "not-a-git-repo" };
  }
  const b = spawnSync("git", ["-C", cwd, "rev-parse", "--abbrev-ref", "HEAD"], {
    encoding: "utf8"
  });
  const branch = b.status === 0 ? b.stdout.trim() || null : null;
  const st = spawnSync("git", ["-C", cwd, "status", "--porcelain"], { encoding: "utf8" });
  const isDirty = st.status === 0 && (st.stdout?.trim().length ?? 0) > 0;
  return { available: true, branch, isDirty };
}

/** Branches where dirty + in_progress work should trigger maintainer delivery advisories. */
export function isProtectedMaintainerBranch(branch: string | null): boolean {
  if (!branch) return false;
  if (branch === "main" || branch === "master") return true;
  return /^release\/phase-[0-9]+$/.test(branch);
}

export async function countInProgressExecutionTasksSqlite(dbAbs: string): Promise<number | null> {
  if (!fs.existsSync(dbAbs)) {
    return null;
  }
  let Database: typeof DatabaseCtor;
  try {
    ({ default: Database } = await import("better-sqlite3"));
  } catch {
    return null;
  }
  const db = new Database(dbAbs, { readonly: true });
  try {
    const row = db
      .prepare(`SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name=?`)
      .get(TASK_ENGINE_TASKS_TABLE) as { ok: number } | undefined;
    if (!row) return null;
    const r2 = db
      .prepare(
        `SELECT COUNT(1) AS c FROM ${TASK_ENGINE_TASKS_TABLE} WHERE status = 'in_progress' AND archived = 0 AND type != 'wishlist_intake'`
      )
      .get() as { c: number };
    return Number(r2?.c ?? 0);
  } finally {
    db.close();
  }
}

export async function getTaskStatusFromPlanningSqlite(
  dbAbs: string,
  taskId: string
): Promise<string | null> {
  if (!taskId || !fs.existsSync(dbAbs)) {
    return null;
  }
  let Database: typeof DatabaseCtor;
  try {
    ({ default: Database } = await import("better-sqlite3"));
  } catch {
    return null;
  }
  const db = new Database(dbAbs, { readonly: true });
  try {
    const row = db
      .prepare(`SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name=?`)
      .get(TASK_ENGINE_TASKS_TABLE) as { ok: number } | undefined;
    if (!row) return null;
    const r2 = db
      .prepare(`SELECT status FROM ${TASK_ENGINE_TASKS_TABLE} WHERE id = ? AND archived = 0`)
      .get(taskId) as { status: string } | undefined;
    return typeof r2?.status === "string" ? r2.status : null;
  } finally {
    db.close();
  }
}

export function resolvePlanningSqliteAbsolute(cwd: string, dbRel: string): string {
  return path.resolve(cwd, dbRel);
}

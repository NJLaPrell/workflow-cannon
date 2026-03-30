import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import type { ModuleLifecycleContext } from "../../contracts/module-contract.js";
import { getTaskPersistenceBackend, planningSqliteDatabaseRelativePath } from "./planning-config.js";

export type DoctorPlanningIssue = {
  path: string;
  reason: string;
};

/**
 * When effective config selects SQLite for task/wishlist persistence, verify the DB file exists
 * and can be opened read-only; if a planning row is present, validate embedded JSON schemaVersion.
 */
export function validatePlanningPersistenceForDoctor(
  workspacePath: string,
  effectiveConfig: Record<string, unknown>
): DoctorPlanningIssue[] {
  const issues: DoctorPlanningIssue[] = [];
  if (getTaskPersistenceBackend(effectiveConfig) !== "sqlite") {
    return issues;
  }

  const ctx = { workspacePath, effectiveConfig } as ModuleLifecycleContext;
  const dbRel = planningSqliteDatabaseRelativePath(ctx);
  const dbAbs = path.resolve(workspacePath, dbRel);
  const relDisplay = path.relative(workspacePath, dbAbs) || dbAbs;

  if (!fs.existsSync(dbAbs)) {
    issues.push({
      path: relDisplay,
      reason:
        "sqlite-planning-db-missing (tasks.persistenceBackend is sqlite; run migrate-task-persistence json-to-sqlite or fix tasks.sqliteDatabaseRelativePath)"
    });
    return issues;
  }

  let db: Database.Database;
  try {
    db = new Database(dbAbs, { readonly: true });
  } catch (err) {
    issues.push({
      path: relDisplay,
      reason: `sqlite-open-failed: ${(err as Error).message}`
    });
    return issues;
  }

  try {
    const cols = db.prepare("PRAGMA table_info(workspace_planning_state)").all() as { name: string }[];
    const hasWishlist = cols.some((c) => c.name === "wishlist_store_json");
    const row = hasWishlist
      ? (db
          .prepare(
            "SELECT task_store_json, wishlist_store_json FROM workspace_planning_state WHERE id = 1"
          )
          .get() as { task_store_json: string; wishlist_store_json: string } | undefined)
      : (db
          .prepare("SELECT task_store_json FROM workspace_planning_state WHERE id = 1")
          .get() as { task_store_json: string } | undefined);

    if (row) {
      try {
        const taskDoc = JSON.parse(row.task_store_json) as { schemaVersion?: number };
        if (taskDoc.schemaVersion !== 1) {
          issues.push({
            path: relDisplay,
            reason: `sqlite-task_store_json: unsupported schemaVersion (expected 1, got ${taskDoc.schemaVersion})`
          });
        }
      } catch {
        issues.push({ path: relDisplay, reason: "sqlite-task_store_json: invalid JSON" });
      }
      if (hasWishlist && "wishlist_store_json" in row && typeof row.wishlist_store_json === "string") {
        try {
          const wishDoc = JSON.parse(row.wishlist_store_json) as { schemaVersion?: number };
          if (wishDoc.schemaVersion !== 1) {
            issues.push({
              path: relDisplay,
              reason: `sqlite-wishlist_store_json: unsupported schemaVersion (expected 1, got ${wishDoc.schemaVersion})`
            });
          }
        } catch {
          issues.push({ path: relDisplay, reason: "sqlite-wishlist_store_json: invalid JSON" });
        }
      }
    }
  } catch (err) {
    issues.push({
      path: relDisplay,
      reason: `sqlite-schema-invalid: ${(err as Error).message}`
    });
  } finally {
    db.close();
  }

  return issues;
}

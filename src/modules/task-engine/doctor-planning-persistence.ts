import fs from "node:fs";
import path from "node:path";
import type DatabaseCtor from "better-sqlite3";
import type { ModuleLifecycleContext } from "../../contracts/module-contract.js";
import { planningSqliteDatabaseRelativePath } from "./planning-config.js";
import { normalizeTaskStoreDocumentFromUnknown } from "./task-store-migration.js";

type SqliteDb = InstanceType<typeof DatabaseCtor>;

export type DoctorPlanningIssue = {
  path: string;
  reason: string;
};

function nativeSqliteFailureLooksLikeAbiMismatch(msg: string): boolean {
  return (
    msg.includes("NODE_MODULE_VERSION") ||
    msg.includes("was compiled against a different Node.js") ||
    msg.includes("better_sqlite3.node")
  );
}

/**
 * When effective config selects SQLite for task/wishlist persistence, verify the native addon loads,
 * the DB file exists and can be opened read-only; if a planning row is present, validate embedded task JSON.
 */
export async function validatePlanningPersistenceForDoctor(
  workspacePath: string,
  effectiveConfig: Record<string, unknown>
): Promise<DoctorPlanningIssue[]> {
  const issues: DoctorPlanningIssue[] = [];

  let Database: typeof DatabaseCtor;
  try {
    ({ default: Database } = await import("better-sqlite3"));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const hint =
      nativeSqliteFailureLooksLikeAbiMismatch(msg) ?
        "Run `pnpm rebuild better-sqlite3` or `npm rebuild better-sqlite3` in the install root (package postinstall usually retries this for ABI mismatch)."
      : "See docs/maintainers/runbooks/native-sqlite-consumer-install.md for install and troubleshooting.";
    issues.push({
      path: "better-sqlite3",
      reason: `native-sqlite-load-failed: ${msg} — ${hint}`
    });
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

  let db: SqliteDb;
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
    const qcRows = db.prepare("PRAGMA quick_check").all() as Record<string, unknown>[];
    for (const row of qcRows) {
      const cell = Object.values(row)[0];
      if (typeof cell === "string" && cell.toLowerCase() !== "ok") {
        issues.push({
          path: relDisplay,
          reason: `sqlite-quick_check-failed: ${cell} — see docs/maintainers/runbooks/native-sqlite-consumer-install.md`
        });
        return issues;
      }
    }

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
        normalizeTaskStoreDocumentFromUnknown(JSON.parse(row.task_store_json));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        issues.push({ path: relDisplay, reason: `sqlite-task_store_json: ${msg}` });
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

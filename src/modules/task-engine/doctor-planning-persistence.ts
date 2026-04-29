import fs from "node:fs";
import path from "node:path";
import type DatabaseCtor from "better-sqlite3";
import type { ModuleLifecycleContext } from "../../contracts/module-contract.js";
import { TASK_ENGINE_TASKS_TABLE } from "../../core/state/workspace-kit-sqlite.js";
import { planningSqliteDatabaseRelativePath } from "./planning-config.js";
import { normalizeTaskStoreDocumentFromUnknown } from "./persistence/task-store-migration.js";
import { loadTaskFeatureLinkMap } from "./persistence/feature-registry-queries.js";
import { rowToTaskEntity, type TaskEngineTaskRow } from "./persistence/sqlite-task-row-mapping.js";

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
    const runbook = "docs/maintainers/runbooks/native-sqlite-consumer-install.md";
    const hint =
      nativeSqliteFailureLooksLikeAbiMismatch(msg) ?
        `Rebuild the native addon in the install root: \`pnpm rebuild better-sqlite3\` or \`npm rebuild better-sqlite3\` (postinstall retries ABI mismatch). Full ladder: ${runbook}.`
      : `Install / toolchain / permissions checklist: ${runbook}.`;
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
      reason: `sqlite-open-failed: ${(err as Error).message} — check DB path permissions, disk, and WAL sidecars; ordered recovery: docs/maintainers/runbooks/native-sqlite-consumer-install.md`
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
    const colSet = new Set(cols.map((c) => c.name));
    const hasWishlist = colSet.has("wishlist_store_json");
    const hasRelational = colSet.has("relational_tasks") && colSet.has("transition_log_json");
    const hasTaskTable = Boolean(
      (
        db
          .prepare("SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?")
          .get(TASK_ENGINE_TASKS_TABLE) as { ok: number } | undefined
      )?.ok
    );
    const row = hasWishlist
      ? hasRelational
        ? (db
            .prepare(
              "SELECT task_store_json, wishlist_store_json, transition_log_json, mutation_log_json, relational_tasks FROM workspace_planning_state WHERE id = 1"
            )
            .get() as
            | {
                task_store_json: string;
                wishlist_store_json: string;
                transition_log_json: string;
                mutation_log_json: string;
                relational_tasks: number;
              }
            | undefined)
        : (db
            .prepare(
              "SELECT task_store_json, wishlist_store_json FROM workspace_planning_state WHERE id = 1"
            )
            .get() as { task_store_json: string; wishlist_store_json: string } | undefined)
      : hasRelational
        ? (db
            .prepare(
              "SELECT task_store_json, transition_log_json, mutation_log_json, relational_tasks FROM workspace_planning_state WHERE id = 1"
            )
            .get() as
            | {
                task_store_json: string;
                transition_log_json: string;
                mutation_log_json: string;
                relational_tasks: number;
              }
            | undefined)
        : (db
            .prepare("SELECT task_store_json FROM workspace_planning_state WHERE id = 1")
            .get() as { task_store_json: string } | undefined);

    if (row) {
      const relationalOn =
        hasRelational &&
        "relational_tasks" in row &&
        typeof (row as { relational_tasks: unknown }).relational_tasks === "number" &&
        (row as { relational_tasks: number }).relational_tasks === 1;
      try {
        normalizeTaskStoreDocumentFromUnknown(JSON.parse(row.task_store_json));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        issues.push({ path: relDisplay, reason: `sqlite-task_store_json: ${msg}` });
      }
      if (relationalOn && hasTaskTable && "transition_log_json" in row && "mutation_log_json" in row) {
        const envRow = row as {
          transition_log_json: string;
          mutation_log_json: string;
        };
        try {
          JSON.parse(envRow.transition_log_json);
          JSON.parse(envRow.mutation_log_json);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          issues.push({ path: relDisplay, reason: `sqlite-envelope-logs: ${msg}` });
        }
        try {
          const trows = db.prepare(`SELECT * FROM ${TASK_ENGINE_TASKS_TABLE}`).all() as TaskEngineTaskRow[];
          const fmap = loadTaskFeatureLinkMap(db);
          for (const tr of trows) {
            rowToTaskEntity(tr, { taskFeatureLinkMap: fmap });
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          issues.push({ path: relDisplay, reason: `sqlite-${TASK_ENGINE_TASKS_TABLE}: ${msg}` });
        }
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
      reason: `sqlite-schema-invalid: ${(err as Error).message} — see docs/maintainers/runbooks/native-sqlite-consumer-install.md (corruption / migration recovery).`
    });
  } finally {
    db.close();
  }

  return issues;
}

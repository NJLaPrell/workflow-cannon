import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import type { ModuleCommandResult, ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import { TASK_ENGINE_TASKS_TABLE, TASK_ENGINE_TRANSITION_LOG_TABLE, TASK_ENGINE_MUTATION_LOG_TABLE } from "../../../core/state/workspace-kit-sqlite.js";
import { planningSqliteDatabaseRelativePath } from "../planning-config.js";
import type { TaskEntity, TaskMutationEvidence, TransitionEvidence } from "../types.js";
import { validateTaskEntityForStrictMode } from "../strict-task-validation.js";
import { normalizeTaskStoreDocumentFromUnknown } from "./task-store-migration.js";
import { rowToTaskEntity, type TaskEngineTaskRow } from "./sqlite-task-row-mapping.js";

type SqliteDb = InstanceType<typeof Database>;

export type TaskPersistenceReadinessSeverity = "ok" | "warning" | "error";

export type TaskPersistenceReadinessCheck = {
  code: string;
  severity: TaskPersistenceReadinessSeverity;
  message: string;
  affectedCount: number;
  sampleTaskIds: string[];
  remediation: string | null;
};

export type TaskPersistenceReadinessReport = {
  schemaVersion: 1;
  ready: boolean;
  dbPath: string;
  sqliteUserVersion: number | null;
  planningGeneration: number | null;
  relationalTasks: boolean | null;
  taskCount: number;
  transitionCount: number;
  mutationCount: number;
  checks: TaskPersistenceReadinessCheck[];
  summary: {
    errorCount: number;
    warningCount: number;
    okCount: number;
  };
};

function check(args: {
  code: string;
  severity: TaskPersistenceReadinessSeverity;
  message: string;
  affectedCount?: number;
  sampleTaskIds?: string[];
  remediation?: string | null;
}): TaskPersistenceReadinessCheck {
  return {
    code: args.code,
    severity: args.severity,
    message: args.message,
    affectedCount: args.affectedCount ?? 0,
    sampleTaskIds: [...new Set(args.sampleTaskIds ?? [])].slice(0, 10),
    remediation: args.remediation ?? null
  };
}

function columnNames(db: SqliteDb, table: string): Set<string> {
  const exists = db
    .prepare("SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(table) as { ok: number } | undefined;
  if (!exists) {
    return new Set();
  }
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return new Set(rows.map((r) => r.name));
}

function parseJsonArray(value: string, code: string, label: string): unknown[] {
  const parsed = JSON.parse(value) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error(`${code}: ${label} must be a JSON array`);
  }
  return parsed;
}

function collectSqliteKitTaskLinkIntegrityChecks(db: SqliteDb, taskTable: string): TaskPersistenceReadinessCheck[] {
  const out: TaskPersistenceReadinessCheck[] = [];
  const tablePresent = (name: string): boolean =>
    Boolean(
      db.prepare("SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?").get(name) as
        | { ok: number }
        | undefined
    );

  if (tablePresent("kit_team_assignments")) {
    const rows = db
      .prepare(
        `SELECT ta.id AS linkId FROM kit_team_assignments ta
         LEFT JOIN ${taskTable} t ON t.id = ta.execution_task_id
         WHERE t.id IS NULL LIMIT 11`
      )
      .all() as Array<{ linkId: string }>;
    out.push(
      rows.length > 0
        ? check({
            code: "kit-team-assignment-orphan-execution-task",
            severity: "error",
            message: "kit_team_assignments.execution_task_id references missing task_engine_tasks rows.",
            affectedCount: rows.length,
            sampleTaskIds: rows.map((r) => r.linkId),
            remediation:
              "Delete stray assignments or restore missing tasks before applying kit SQLite user_version 18+ migrations."
          })
        : check({
            code: "kit-team-assignments-task-refs-ok",
            severity: "ok",
            message: "Team assignment execution_task_id values reference existing tasks."
          })
    );
  }

  if (tablePresent("kit_subagent_sessions")) {
    const rows = db
      .prepare(
        `SELECT id FROM kit_subagent_sessions
         WHERE execution_task_id IS NOT NULL
           AND execution_task_id NOT IN (SELECT id FROM ${taskTable})
         LIMIT 11`
      )
      .all() as Array<{ id: string }>;
    out.push(
      rows.length > 0
        ? check({
            code: "kit-subagent-session-stale-execution-task",
            severity: "warning",
            message: "Some subagent sessions reference execution_task_id values absent from task_engine_tasks.",
            affectedCount: rows.length,
            sampleTaskIds: rows.map((r) => r.id),
            remediation: "Clear stale execution_task_id values or open the workspace once to run v18 migration (SET NULL on invalid refs)."
          })
        : check({
            code: "kit-subagent-sessions-task-refs-ok",
            severity: "ok",
            message: "Subagent sessions only reference execution tasks that exist (or NULL)."
          })
    );
  }

  if (tablePresent("kit_task_checkpoints")) {
    const rows = db
      .prepare(
        `SELECT id FROM kit_task_checkpoints
         WHERE task_id IS NOT NULL AND task_id NOT IN (SELECT id FROM ${taskTable})
         LIMIT 11`
      )
      .all() as Array<{ id: string }>;
    out.push(
      rows.length > 0
        ? check({
            code: "kit-task-checkpoint-stale-task",
            severity: "warning",
            message: "Some git checkpoints reference task_id values absent from task_engine_tasks.",
            affectedCount: rows.length,
            sampleTaskIds: rows.map((r) => r.id),
            remediation: "Backfill tasks or clear stale task_id on checkpoints before relying on FK-clean v18+ schema."
          })
        : check({
            code: "kit-task-checkpoints-task-refs-ok",
            severity: "ok",
            message: "Task checkpoints only reference existing tasks (or NULL)."
          })
    );
  }

  if (tablePresent(TASK_ENGINE_TRANSITION_LOG_TABLE)) {
    const row = db
      .prepare(
        `SELECT COUNT(*) AS c FROM ${TASK_ENGINE_TRANSITION_LOG_TABLE} tl
         WHERE NOT EXISTS (SELECT 1 FROM ${taskTable} t WHERE t.id = tl.task_id)`
      )
      .get() as { c: number };
    const c = Number(row?.c) || 0;
    out.push(
      c > 0
        ? check({
            code: "task-transition-log-orphan-task-ids",
            severity: "warning",
            message:
              "Transition log rows reference task_id values not present in task_engine_tasks (historical or corrupt).",
            affectedCount: c,
            remediation:
              "SQLite does not FK-bind evidence tables; inspect get-task-history for these ids or repair rows if corrupt."
          })
        : check({
            code: "task-transition-log-task-refs-ok",
            severity: "ok",
            message: "Transition log task_id values match relational tasks (or log empty)."
          })
    );
  }

  if (tablePresent(TASK_ENGINE_MUTATION_LOG_TABLE)) {
    const row = db
      .prepare(
        `SELECT COUNT(*) AS c FROM ${TASK_ENGINE_MUTATION_LOG_TABLE} ml
         WHERE NOT EXISTS (SELECT 1 FROM ${taskTable} t WHERE t.id = ml.task_id)`
      )
      .get() as { c: number };
    const c = Number(row?.c) || 0;
    out.push(
      c > 0
        ? check({
            code: "task-mutation-log-orphan-task-ids",
            severity: "warning",
            message: "Mutation log rows reference task_id values not present in task_engine_tasks.",
            affectedCount: c,
            remediation: "Treat as historical evidence; repair only if rows are clearly corrupt."
          })
        : check({
            code: "task-mutation-log-task-refs-ok",
            severity: "ok",
            message: "Mutation log task_id values match relational tasks (or log empty)."
          })
    );
  }

  return out;
}

function collectTaskShapeChecks(tasks: TaskEntity[]): TaskPersistenceReadinessCheck[] {
  const invalid: string[] = [];
  const invalidStatus: string[] = [];
  const invalidArchived: string[] = [];
  const invalidTimestamps: string[] = [];
  for (const task of tasks) {
    const strictIssue = validateTaskEntityForStrictMode(task);
    if (strictIssue) {
      invalid.push(task.id);
    }
    if (
      !["research", "proposed", "ready", "in_progress", "blocked", "completed", "cancelled"].includes(
        task.status
      )
    ) {
      invalidStatus.push(task.id);
    }
    if (task.archived === true && typeof task.archivedAt !== "string") {
      invalidArchived.push(task.id);
    }
    if (!Number.isFinite(Date.parse(task.createdAt)) || !Number.isFinite(Date.parse(task.updatedAt))) {
      invalidTimestamps.push(task.id);
    }
  }
  const checks: TaskPersistenceReadinessCheck[] = [];
  checks.push(
    invalid.length > 0
      ? check({
          code: "task-shape-invalid",
          severity: "error",
          message: "One or more task rows fail strict task entity validation.",
          affectedCount: invalid.length,
          sampleTaskIds: invalid,
          remediation: "Fix task row fields before applying stricter schema migrations."
        })
      : check({
          code: "task-shape-valid",
          severity: "ok",
          message: "Task rows satisfy strict task entity validation."
        })
  );
  if (invalidStatus.length > 0) {
    checks.push(
      check({
        code: "task-status-invalid",
        severity: "error",
        message: "Task rows contain unsupported status values.",
        affectedCount: invalidStatus.length,
        sampleTaskIds: invalidStatus,
        remediation: "Normalize statuses with task-engine transitions or documented recovery before migration."
      })
    );
  }
  if (invalidArchived.length > 0) {
    checks.push(
      check({
        code: "task-archived-flag-inconsistent",
        severity: "warning",
        message: "Archived tasks are missing archivedAt timestamps.",
        affectedCount: invalidArchived.length,
        sampleTaskIds: invalidArchived,
        remediation: "Backfill archivedAt or clear archived where the row is not actually archived."
      })
    );
  }
  if (invalidTimestamps.length > 0) {
    checks.push(
      check({
        code: "task-timestamps-invalid",
        severity: "error",
        message: "Task rows contain invalid createdAt or updatedAt timestamps.",
        affectedCount: invalidTimestamps.length,
        sampleTaskIds: invalidTimestamps,
        remediation: "Repair timestamps before migrations add stricter checks."
      })
    );
  }
  return checks;
}

function collectDependencyChecks(tasks: TaskEntity[]): TaskPersistenceReadinessCheck[] {
  const ids = new Set(tasks.map((task) => task.id));
  const missing: string[] = [];
  const self: string[] = [];
  for (const task of tasks) {
    for (const dep of task.dependsOn ?? []) {
      if (dep === task.id) {
        self.push(task.id);
      } else if (!ids.has(dep)) {
        missing.push(task.id);
      }
    }
  }
  const checks: TaskPersistenceReadinessCheck[] = [];
  checks.push(
    missing.length > 0
      ? check({
          code: "task-dependency-missing-target",
          severity: "error",
          message: "Some dependsOn entries point at missing task ids.",
          affectedCount: missing.length,
          sampleTaskIds: missing,
          remediation: "Create the missing dependency tasks, remove stale dependsOn entries, or document recovery."
        })
      : check({
          code: "task-dependencies-target-existing-tasks",
          severity: "ok",
          message: "All dependency targets exist in the task snapshot."
        })
  );
  if (self.length > 0) {
    checks.push(
      check({
        code: "task-dependency-self-reference",
        severity: "error",
        message: "Some tasks depend on themselves.",
        affectedCount: self.length,
        sampleTaskIds: self,
        remediation: "Remove self-dependencies before enabling relational dependency constraints."
      })
    );
  }
  return checks;
}

function summarize(checks: TaskPersistenceReadinessCheck[]): TaskPersistenceReadinessReport["summary"] {
  return {
    errorCount: checks.filter((c) => c.severity === "error").length,
    warningCount: checks.filter((c) => c.severity === "warning").length,
    okCount: checks.filter((c) => c.severity === "ok").length
  };
}

export function buildTaskPersistenceReadinessReport(args: {
  workspacePath: string;
  effectiveConfig: Record<string, unknown> | undefined;
}): TaskPersistenceReadinessReport {
  const ctx = {
    workspacePath: args.workspacePath,
    effectiveConfig: args.effectiveConfig ?? {}
  } as ModuleLifecycleContext;
  const dbRel = planningSqliteDatabaseRelativePath(ctx);
  const dbPath = path.resolve(args.workspacePath, dbRel);
  const checks: TaskPersistenceReadinessCheck[] = [];
  let sqliteUserVersion: number | null = null;
  let planningGeneration: number | null = null;
  let relationalTasks: boolean | null = null;
  let taskCount = 0;
  let transitionCount = 0;
  let mutationCount = 0;

  if (!fs.existsSync(dbPath)) {
    checks.push(
      check({
        code: "sqlite-db-missing",
        severity: "error",
        message: "SQLite planning DB is missing.",
        remediation: "Run migrate-task-persistence or initialize the workspace before schema migration."
      })
    );
    const summary = summarize(checks);
    return {
      schemaVersion: 1,
      ready: false,
      dbPath,
      sqliteUserVersion,
      planningGeneration,
      relationalTasks,
      taskCount,
      transitionCount,
      mutationCount,
      checks,
      summary
    };
  }

  let db: SqliteDb;
  try {
    db = new Database(dbPath, { readonly: true });
  } catch (err) {
    checks.push(
      check({
        code: "sqlite-open-failed",
        severity: "error",
        message: `SQLite planning DB could not be opened: ${(err as Error).message}`,
        remediation: "Check DB path permissions, disk state, and native SQLite installation."
      })
    );
    const summary = summarize(checks);
    return {
      schemaVersion: 1,
      ready: false,
      dbPath,
      sqliteUserVersion,
      planningGeneration,
      relationalTasks,
      taskCount,
      transitionCount,
      mutationCount,
      checks,
      summary
    };
  }

  try {
    sqliteUserVersion = Number((db.prepare("PRAGMA user_version").get() as Record<string, unknown>).user_version ?? 0);
    const quick = db.prepare("PRAGMA quick_check").all() as Record<string, unknown>[];
    const quickFailures = quick
      .map((row) => String(Object.values(row)[0] ?? ""))
      .filter((value) => value.toLowerCase() !== "ok");
    checks.push(
      quickFailures.length > 0
        ? check({
            code: "sqlite-quick-check-failed",
            severity: "error",
            message: `SQLite quick_check reported ${quickFailures.length} issue(s).`,
            affectedCount: quickFailures.length,
            remediation: "Back up the DB and follow SQLite recovery guidance before migration."
          })
        : check({
            code: "sqlite-quick-check-ok",
            severity: "ok",
            message: "SQLite quick_check returned ok."
          })
    );

    const planningCols = columnNames(db, "workspace_planning_state");
    if (planningCols.size === 0) {
      checks.push(
        check({
          code: "workspace-planning-state-missing",
          severity: "error",
          message: "workspace_planning_state table is missing.",
          remediation: "Open the DB through workspace-kit migrations or restore from backup."
        })
      );
      const summary = summarize(checks);
      return {
        schemaVersion: 1,
        ready: false,
        dbPath,
        sqliteUserVersion,
        planningGeneration,
        relationalTasks,
        taskCount,
        transitionCount,
        mutationCount,
        checks,
        summary
      };
    }

    const row = db.prepare("SELECT * FROM workspace_planning_state WHERE id = 1").get() as
      | Record<string, unknown>
      | undefined;
    if (!row) {
      checks.push(
        check({
          code: "workspace-planning-state-row-missing",
          severity: "warning",
          message: "workspace_planning_state has no singleton row; treating as first-run/no-task state.",
          remediation: "Open through workspace-kit or run an initializing command before applying migrations."
        })
      );
    }
    planningGeneration =
      row && typeof row.planning_generation === "number" ? Number(row.planning_generation) : null;
    relationalTasks =
      row && typeof row.relational_tasks === "number" ? Number(row.relational_tasks) === 1 : null;

    let tasks: TaskEntity[] = [];
    if (row && typeof row.task_store_json === "string") {
      try {
        const doc = normalizeTaskStoreDocumentFromUnknown(JSON.parse(row.task_store_json));
        tasks = doc.tasks;
        transitionCount = doc.transitionLog.length;
        mutationCount = doc.mutationLog?.length ?? 0;
        checks.push(
          check({
            code: "task-store-json-valid",
            severity: "ok",
            message: "task_store_json parsed as a v1 task document."
          })
        );
      } catch (err) {
        checks.push(
          check({
            code: "task-store-json-invalid",
            severity: "error",
            message: `task_store_json is invalid: ${(err as Error).message}`,
            remediation: "Repair or restore the task document before migration."
          })
        );
      }
    }

    if (row && typeof row.transition_log_json === "string" && typeof row.mutation_log_json === "string") {
      try {
        transitionCount = parseJsonArray(row.transition_log_json, "transition-log-json-invalid", "transition_log_json").length;
        mutationCount = parseJsonArray(row.mutation_log_json, "mutation-log-json-invalid", "mutation_log_json").length;
        checks.push(
          check({
            code: "task-envelope-logs-valid",
            severity: "ok",
            message: "transition_log_json and mutation_log_json parsed as arrays."
          })
        );
      } catch (err) {
        checks.push(
          check({
            code: "task-envelope-logs-invalid",
            severity: "error",
            message: (err as Error).message,
            remediation: "Repair envelope logs before moving evidence into relational tables."
          })
        );
      }
    } else {
      checks.push(
        check({
          code: "task-envelope-logs-absent",
          severity: "ok",
          message: "No relational envelope log columns are present; treating transition/mutation evidence as empty or legacy."
        })
      );
    }

    const taskTableCols = columnNames(db, TASK_ENGINE_TASKS_TABLE);
    if (taskTableCols.size > 0) {
      checks.push(...collectSqliteKitTaskLinkIntegrityChecks(db, TASK_ENGINE_TASKS_TABLE));
      try {
        const rows = db.prepare(`SELECT * FROM ${TASK_ENGINE_TASKS_TABLE}`).all() as TaskEngineTaskRow[];
        const relationalTasksRows = rows.map((taskRow) => rowToTaskEntity(taskRow));
        if (relationalTasks !== true) {
          checks.push(...collectTaskShapeChecks(relationalTasksRows).filter((c) => c.severity !== "ok"));
        }
        if (relationalTasks === true) {
          tasks = relationalTasksRows;
        }
        taskCount = relationalTasksRows.length;
        checks.push(
          check({
            code: "task-engine-tasks-rows-valid",
            severity: "ok",
            message: `Parsed ${relationalTasksRows.length} relational task row(s).`,
            affectedCount: relationalTasksRows.length
          })
        );
        const legacyFeatureRows = rows
          .filter((taskRow) => {
            const raw = taskRow.features_json;
            return typeof raw === "string" && raw !== "" && raw !== "[]";
          })
          .map((taskRow) => taskRow.id);
        if (legacyFeatureRows.length > 0) {
          checks.push(
            check({
              code: "task-legacy-features-json-present",
              severity: "warning",
              message: "Some relational rows still carry legacy features_json values.",
              affectedCount: legacyFeatureRows.length,
              sampleTaskIds: legacyFeatureRows,
              remediation: "Backfill task feature links before retiring legacy feature fallbacks."
            })
          );
        }
        if (relationalTasks === true && row && typeof row.task_store_json === "string") {
          const blobDoc = normalizeTaskStoreDocumentFromUnknown(JSON.parse(row.task_store_json));
          if (blobDoc.tasks.length > 0 && blobDoc.tasks.length !== relationalTasksRows.length) {
            checks.push(
              check({
                code: "task-blob-relational-count-drift",
                severity: "warning",
                message: "task_store_json task count differs from relational task row count.",
                affectedCount: Math.abs(blobDoc.tasks.length - relationalTasksRows.length),
                remediation: "Regenerate compatibility mirrors or finish blob hot-path retirement."
              })
            );
          }
        }
      } catch (err) {
        checks.push(
          check({
            code: "task-engine-tasks-rows-invalid",
            severity: "error",
            message: `Relational task rows could not be parsed: ${(err as Error).message}`,
            remediation: "Repair relational rows before enabling stricter constraints."
          })
        );
      }
    } else {
      taskCount = tasks.length;
      checks.push(
        check({
          code: "task-engine-tasks-table-absent",
          severity: "warning",
          message: "task_engine_tasks table is absent; migration readiness is limited to blob validation.",
          remediation: "Run sqlite-blob-to-relational readiness before relational schema tightening."
        })
      );
    }

    taskCount = taskCount || tasks.length;
    if (taskCount === 0) {
      checks.push(
        check({
          code: "task-store-empty",
          severity: "ok",
          message: "No task rows are present; empty/first-run task state is explicit."
        })
      );
    }
    if (transitionCount === 0 && mutationCount === 0) {
      checks.push(
        check({
          code: "task-evidence-empty",
          severity: "ok",
          message: "No transition or mutation evidence rows are present; missing evidence is explicit."
        })
      );
    }
    checks.push(...collectTaskShapeChecks(tasks), ...collectDependencyChecks(tasks));
  } finally {
    db.close();
  }

  const summary = summarize(checks);
  return {
    schemaVersion: 1,
    ready: summary.errorCount === 0,
    dbPath,
    sqliteUserVersion,
    planningGeneration,
    relationalTasks,
    taskCount,
    transitionCount,
    mutationCount,
    checks,
    summary
  };
}

export function runTaskPersistenceReadiness(
  ctx: ModuleLifecycleContext,
  _args: Record<string, unknown>
): ModuleCommandResult {
  const report = buildTaskPersistenceReadinessReport({
    workspacePath: ctx.workspacePath,
    effectiveConfig: ctx.effectiveConfig as Record<string, unknown> | undefined
  });
  return {
    ok: true,
    code: "task-persistence-readiness",
    message: report.ready
      ? "Task persistence readiness checks passed"
      : `Task persistence readiness found ${report.summary.errorCount} error check(s)`,
    data: report
  };
}

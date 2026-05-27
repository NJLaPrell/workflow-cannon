import fs from "node:fs";
import path from "node:path";
import type DatabaseCtor from "better-sqlite3";
import type { ModuleLifecycleContext } from "../../contracts/module-contract.js";
import { readTasksCanonicalAuthority } from "./persistence/task-state-canonical-authority.js";
import { planningSqliteDatabaseRelativePath } from "./planning-config.js";
import { readTaskStateEventLogJsonl } from "./task-state-events/task-state-event-log-io.js";
import { replayTaskStateEvents } from "./task-state-events/event-applier.js";
import { admitTaskStateEventStream } from "./task-state-events/event-admission.js";

export type DoctorTaskStateShadowIssue = { path: string; reason: string };

function statusMap(tasks: Array<{ id: string; status: string }>): Map<string, string> {
  return new Map(tasks.map((t) => [t.id, t.status]));
}

export async function collectDoctorTaskStateShadowIssues(
  cwd: string,
  effective: Record<string, unknown>
): Promise<DoctorTaskStateShadowIssue[]> {
  if (readTasksCanonicalAuthority(effective) !== "git-event-log") {
    return [];
  }

  const issues: DoctorTaskStateShadowIssue[] = [];
  const rawEvents = readTaskStateEventLogJsonl(cwd);
  if (rawEvents.length === 0) {
    return [];
  }

  const admitted = admitTaskStateEventStream(rawEvents);
  if (!admitted.ok) {
    issues.push({
      path: ".workspace-kit/tasks/task-state-events.jsonl",
      reason: `shadow-admission-failed: ${admitted.error.message}`
    });
    return issues;
  }

  const replayed = replayTaskStateEvents(admitted.events);
  if (!replayed.ok) {
    issues.push({
      path: ".workspace-kit/tasks/task-state-events.jsonl",
      reason: `shadow-replay-failed: ${replayed.error.message}`
    });
    return issues;
  }

  let Database: typeof DatabaseCtor;
  try {
    ({ default: Database } = await import("better-sqlite3"));
  } catch {
    return issues;
  }

  const ctx = { workspacePath: cwd, effectiveConfig: effective } as ModuleLifecycleContext;
  const dbRel = planningSqliteDatabaseRelativePath(ctx);
  const dbAbs = path.resolve(cwd, dbRel);
  if (!fs.existsSync(dbAbs)) {
    issues.push({ path: dbRel, reason: "shadow-sqlite-missing" });
    return issues;
  }

  let db: InstanceType<typeof DatabaseCtor>;
  try {
    db = new Database(dbAbs, { readonly: true });
  } catch {
    return issues;
  }

  try {
    const rows = db
      .prepare("SELECT id, status FROM task_engine_tasks WHERE archived = 0")
      .all() as Array<{ id: string; status: string }>;
    const sqliteMap = statusMap(rows);
    const eventMap = statusMap(replayed.result.document.tasks);

    for (const [id, sqliteStatus] of sqliteMap) {
      const eventStatus = eventMap.get(id);
      if (eventStatus === undefined) {
        issues.push({
          path: dbRel,
          reason: `shadow-drift: task ${id} in SQLite missing from event projection`
        });
      } else if (eventStatus !== sqliteStatus) {
        issues.push({
          path: dbRel,
          reason: `shadow-drift: task ${id} status sqlite=${sqliteStatus} event=${eventStatus}`
        });
      }
    }

    for (const id of eventMap.keys()) {
      if (!sqliteMap.has(id)) {
        issues.push({
          path: dbRel,
          reason: `shadow-drift: task ${id} in event projection missing from SQLite`
        });
      }
    }
  } finally {
    db.close();
  }

  return issues;
}

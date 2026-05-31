import fs from "node:fs";
import path from "node:path";
import type DatabaseCtor from "better-sqlite3";
import type { ModuleLifecycleContext } from "../../contracts/module-contract.js";
import { resolveEnabledPlanningSyncDomains } from "./persistence/planning-canonical-sync-domains.js";
import { planningSqliteDatabaseRelativePath } from "./planning-config.js";
import { readTasksCanonicalAuthority } from "./persistence/task-state-canonical-authority.js";
import { readTaskStateEventLogJsonl } from "./task-state-events/task-state-event-log-io.js";
import { replayPlanningProjectionFromRawEvents } from "./task-state-git/remote-projection-versions.js";
import {
  assessSnapshotTailFromManifest,
  TASK_STATE_SNAPSHOT_TAIL_WARN_THRESHOLD
} from "./task-state-git/task-state-snapshot-tail-health.js";
import { TASK_STATE_GIT_BRANCH } from "./task-state-git/constants.js";
import { isGitRepository, resolveTaskStateGitRef } from "./task-state-git/git-io.js";
import { readTaskStateBranchLayout } from "./task-state-git/read-branch-layout.js";
import {
  readKitWorkspaceStatusRow,
  workspaceStatusTableAvailable
} from "./persistence/workspace-status-store.js";
import { parseKitPhaseNumberFromYaml } from "./phase-resolution.js";
import { collectDoctorPhaseProjectionCountIssues } from "./sync-backends/git-event-log-phase-projection-guard.js";
import { TaskStore } from "./persistence/store.js";
import { SqliteDualPlanningStore } from "./persistence/sqlite-dual-planning.js";

export type DoctorTaskStateGitHealthIssue = { path: string; reason: string };

function countSetCurrentPhaseEvents(db: InstanceType<typeof DatabaseCtor>): number {
  if (!workspaceStatusTableAvailable(db)) {
    return 0;
  }
  const row = db
    .prepare(
      `SELECT COUNT(*) AS c FROM kit_workspace_status_events WHERE event_kind = 'set_current_phase'`
    )
    .get() as { c: number };
  return row.c;
}

export async function collectDoctorTaskStateGitHealthIssues(
  cwd: string,
  effective: Record<string, unknown>
): Promise<DoctorTaskStateGitHealthIssue[]> {
  if (readTasksCanonicalAuthority(effective) !== "git-event-log") {
    return [];
  }
  if (!isGitRepository(cwd)) {
    return [];
  }

  const issues: DoctorTaskStateGitHealthIssue[] = [];
  const branch = TASK_STATE_GIT_BRANCH;
  const resolved = resolveTaskStateGitRef(cwd, branch);
  if (!("missing" in resolved)) {
    const layoutRead = readTaskStateBranchLayout(cwd, resolved.ref, resolved.tipSha);
    if (layoutRead.ok) {
      const tail = assessSnapshotTailFromManifest(
        cwd,
        resolved.ref,
        layoutRead.layout.manifest,
        TASK_STATE_SNAPSHOT_TAIL_WARN_THRESHOLD
      );
      if (tail?.recommendSnapshot) {
        issues.push({
          path: branch,
          reason: `task-state-snapshot-tail-large: ${tail.message} — ${tail.recommendedCommand}`
        });
      }
    }
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
    return issues;
  }

  let phaseKey: string | null = parseKitPhaseNumberFromYaml(
    String((effective.kit as Record<string, unknown> | undefined)?.currentPhaseNumber ?? "")
  );
  let db: InstanceType<typeof DatabaseCtor>;
  try {
    db = new Database(dbAbs, { readonly: true });
  } catch {
    return issues;
  }

  try {
    if (
      resolveEnabledPlanningSyncDomains({ effectiveConfig: effective }).includes("workspace_status") &&
      workspaceStatusTableAvailable(db)
    ) {
      const rolloverCount = countSetCurrentPhaseEvents(db);
      const ws = readKitWorkspaceStatusRow(db);
      phaseKey = parseKitPhaseNumberFromYaml(ws?.currentKitPhase ?? null) ?? phaseKey;
      if (ws && ws.workspaceRevision >= 5 && rolloverCount === 0) {
        issues.push({
          path: dbRel,
          reason:
            "planning-rollover-audit-missing: kit_workspace_status_events has no set_current_phase rows; phase roster Delivered tags will be wrong after hydrate — use set-current-phase (git canonical) or restore rollover audits before hydrate"
        });
      }

      const raw = readTaskStateEventLogJsonl(cwd);
      if (raw.length > 0) {
        const replayed = replayPlanningProjectionFromRawEvents(raw);
        const gitRevision = replayed.workspaceStatus?.workspaceRevision ?? null;
        if (gitRevision !== null && ws && gitRevision !== ws.workspaceRevision) {
          issues.push({
            path: dbRel,
            reason: `planning-workspace-revision-drift: SQLite workspaceRevision=${ws.workspaceRevision} but planning git replay=${gitRevision} — run task-state-hydrate with fetch or repair-task-state-cache`
          });
        }
      }
    }
  } finally {
    db.close();
  }

  try {
    const dual = new SqliteDualPlanningStore(cwd, dbRel);
    dual.loadFromDisk();
    const store = TaskStore.forSqliteDual(dual);
    await store.load();
    const projectionIssues = await collectDoctorPhaseProjectionCountIssues(
      cwd,
      effective,
      store.getActiveTasks(),
      phaseKey
    );
    issues.push(...projectionIssues);
  } catch {
    // phase projection guard is advisory when store cannot be read
  }

  return issues;
}

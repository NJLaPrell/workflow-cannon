import fs from "node:fs";
import path from "node:path";
import type { ModuleCommandResult, ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import { DEFAULT_TASK_STATE_EVENT_LOG_RELATIVE, resolveTaskStateEventLogPath } from "../task-state-events/task-state-event-log-io.js";
import { TASK_STATE_GIT_BRANCH } from "../task-state-git/constants.js";
import {
  gitFetchTaskStateBranch,
  isGitRepository,
  resolveTaskStateGitRef
} from "../task-state-git/git-io.js";
import { gitShowText } from "../task-state-git/git-io.js";
import {
  resolveSnapshotContentRelativePath,
  resolveSnapshotMetaRelativePath
} from "../task-state-git/layout.js";
import {
  readEventSegmentsJsonl,
  readTaskStateBranchLayout,
  segmentPathsThroughHead
} from "../task-state-git/read-branch-layout.js";
import {
  documentFromSnapshotContent,
  replayTailFromSnapshot,
  type TaskStateSnapshotContentV1
} from "../task-state-git/snapshot-projection.js";
import { validateTaskStateGitSnapshotMeta } from "../task-state-git/validate-snapshot-meta.js";
import { admitRemoteEventStream } from "../task-state-git/remote-projection-versions.js";
import { runRebuildTaskStateCache } from "./rebuild-task-state-cache-runtime.js";
import {
  openPlanningStoresForTaskStateCache,
  persistTaskStateProjectionDocument,
  upsertProjectionMetaAfterApply
} from "./task-state-cache-runtime-shared.js";
import type { CanonicalStateEventV1 } from "../task-state-events/canonical-state-events.js";
import { isTaskStateEvent } from "../task-state-events/canonical-state-events.js";
import { replayPlanningEventsFromCanonical } from "../task-state-events/canonical-replay.js";
import { persistPlanningProjectionToSqlite } from "../task-state-events/planning-sqlite-persist.js";
import { enabledPlanningSyncDomainSet } from "./planning-canonical-sync-domains.js";

export async function runTaskStateHydrate(
  ctx: ModuleLifecycleContext,
  args: Record<string, unknown>
): Promise<ModuleCommandResult> {
  const dryRun = args.dryRun === true;
  const fetch = args.fetch !== false;
  const branch =
    typeof args.branch === "string" && args.branch.trim() ? args.branch.trim() : TASK_STATE_GIT_BRANCH;
  const eventLogRelativePath =
    typeof args.eventLogRelativePath === "string" && args.eventLogRelativePath.trim()
      ? args.eventLogRelativePath.trim()
      : DEFAULT_TASK_STATE_EVENT_LOG_RELATIVE;

  if (!isGitRepository(ctx.workspacePath)) {
    return {
      ok: false,
      code: "not-a-git-repo",
      message: "task-state-hydrate requires a git workspace"
    };
  }

  let fetchOk = true;
  let fetchStderr: string | undefined;
  if (fetch) {
    const fr = gitFetchTaskStateBranch(ctx.workspacePath, branch);
    fetchOk = fr.ok;
    fetchStderr = fr.stderr || undefined;
    if (!fr.ok && !dryRun) {
      return {
        ok: false,
        code: "task-state-fetch-failed",
        message: `git fetch failed for ${branch}`,
        data: { schemaVersion: 1, stderr: fetchStderr }
      };
    }
  }

  const resolved = resolveTaskStateGitRef(ctx.workspacePath, branch);
  if ("missing" in resolved) {
    return {
      ok: false,
      code: "task-state-branch-missing",
      message: `Canonical branch ${branch} is not available (try fetch:true)`,
      data: { schemaVersion: 1, tried: resolved.tried, fetchOk, fetchStderr }
    };
  }

  const layoutRead = readTaskStateBranchLayout(ctx.workspacePath, resolved.ref, resolved.tipSha);
  if (!layoutRead.ok) {
    return {
      ok: false,
      code: layoutRead.code,
      message: layoutRead.message,
      data: { schemaVersion: 1, ref: resolved.ref }
    };
  }

  const segmentPaths =
    layoutRead.layout.eventSegmentPaths.length > 0
      ? layoutRead.layout.eventSegmentPaths
      : segmentPathsThroughHead(layoutRead.layout.manifest);

  const eventsRead = readEventSegmentsJsonl(ctx.workspacePath, resolved.ref, segmentPaths);
  if (!eventsRead.ok) {
    return {
      ok: false,
      code: eventsRead.code,
      message: eventsRead.message,
      data: { schemaVersion: 1, segmentPaths }
    };
  }

  const logPath = resolveTaskStateEventLogPath(ctx.workspacePath, eventLogRelativePath);
  const preview = {
    schemaVersion: 1,
    dryRun,
    branch,
    gitRef: resolved.ref,
    remoteTipSha: resolved.tipSha,
    eventLogPath: logPath,
    segmentCount: segmentPaths.length,
    eventLineCount: eventsRead.lines.length,
    remoteLatestSequence: layoutRead.layout.manifest.head.latestSequence,
    fetchOk,
    fetchStderr
  };

  if (dryRun) {
    return {
      ok: true,
      code: "task-state-hydrate-dry-run",
      message: "Dry run: would write canonical JSONL and rebuild SQLite projection",
      data: preview
    };
  }

  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  const body = eventsRead.lines.length > 0 ? `${eventsRead.lines.join("\n")}\n` : "";
  fs.writeFileSync(logPath, body, "utf8");

  const rawEvents = eventsRead.lines.map((line) => JSON.parse(line) as unknown);
  const admitted = admitRemoteEventStream(
    ctx.workspacePath,
    resolved.ref,
    layoutRead.layout.manifest,
    rawEvents
  );
  if (!admitted.ok) {
    return {
      ok: false,
      code: "task-state-event-admission-rejected",
      message: admitted.error.message,
      data: { schemaVersion: 1, admissionCode: admitted.error.code }
    };
  }

  const snapshotId = layoutRead.layout.manifest.head.latestSnapshotId;
  let hydrateMode: "full-replay" | "snapshot-plus-tail" = "full-replay";
  let document: ReturnType<typeof documentFromSnapshotContent> | undefined;

  if (snapshotId) {
    const metaText = gitShowText(
      ctx.workspacePath,
      resolved.ref,
      resolveSnapshotMetaRelativePath(snapshotId)
    );
    const contentText = gitShowText(
      ctx.workspacePath,
      resolved.ref,
      resolveSnapshotContentRelativePath(snapshotId)
    );
    if (metaText && contentText) {
      const metaParsed = validateTaskStateGitSnapshotMeta(JSON.parse(metaText) as unknown);
      if (metaParsed.ok) {
        const snapshotContent = JSON.parse(contentText) as TaskStateSnapshotContentV1;
        const tailReplay = replayTailFromSnapshot({
          snapshot: snapshotContent,
          throughSequence: metaParsed.data.throughSequence,
          tailEvents: admitted.events.filter(isTaskStateEvent)
        });
        if (tailReplay.ok) {
          hydrateMode = "snapshot-plus-tail";
          document = tailReplay.document;
        }
      }
    }
  }

  if (hydrateMode === "full-replay") {
    const rebuild = await runRebuildTaskStateCache(ctx, {
      eventLogRelativePath,
      policyApproval: args.policyApproval
    });
    if (!rebuild.ok) {
      return rebuild;
    }
    return {
      ok: true,
      code: "task-state-hydrated",
      message: "Hydrated local task-state cache from git branch and rebuilt projection",
      data: {
        ...preview,
        hydrateMode,
        rebuild: rebuild.data
      }
    };
  }

  const planning = await openPlanningStoresForTaskStateCache(ctx);
  persistTaskStateProjectionDocument(planning, document!);
  const enabledDomains = enabledPlanningSyncDomainSet(ctx);
  const planningReplay = replayPlanningEventsFromCanonical(rawEvents as CanonicalStateEventV1[], {
    enabledDomains
  });
  if (!planningReplay.ok) {
    return {
      ok: false,
      code: "planning-state-hydrate-failed",
      message: `Planning projection replay failed: ${planningReplay.error.message}`,
      data: { schemaVersion: 1, eventId: planningReplay.error.eventId, hydrateMode, snapshotId }
    };
  }
  persistPlanningProjectionToSqlite(
    planning.sqliteDual.getDatabase(),
    planningReplay.projection,
    { enabledDomains }
  );
  upsertProjectionMetaAfterApply(planning, {
    appliedSequence: layoutRead.layout.manifest.head.latestSequence,
    sourceCommit: resolved.tipSha,
    syncStatus: "fresh",
    updatedAt: new Date().toISOString()
  });

  return {
    ok: true,
    code: "task-state-hydrated",
    message: "Hydrated from latest snapshot plus tail events",
    data: {
      ...preview,
      hydrateMode,
      snapshotId,
      taskCount: document!.tasks.length
    }
  };
}

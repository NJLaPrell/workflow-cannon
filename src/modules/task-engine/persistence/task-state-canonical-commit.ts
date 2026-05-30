import type { ModuleCommandResult, ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import { TASK_STATE_GIT_BRANCH } from "../task-state-git/constants.js";
import { taskIdsTouchedByEvent } from "../task-state-git/publish-task-state-events.js";
import { expectedVersionsForPublish } from "../task-state-git/remote-projection-versions.js";
import type { CanonicalStateEventV1 } from "../task-state-events/canonical-state-events.js";
import { isTaskStateEvent } from "../task-state-events/canonical-state-events.js";
import type { TaskStateEventV1 } from "../task-state-events/event-payloads.js";
import type { PlanningStateEventV1 } from "../task-state-events/planning-event-payloads.js";
import { isCanonicalSyncHeadFailure } from "../sync-backends/canonical-state-sync-backend.js";
import {
  createGitEventLogBackendFromContext,
  publishEventsViaGitBackend
} from "../sync-backends/git-event-log-backend.js";
import type { OpenedPlanningStores } from "./planning-open.js";
import { openPlanningStores } from "./planning-open.js";
import { createCanonicalEventOutboxRepository } from "./canonical-event-outbox-runtime.js";
import { runTaskStateHydrate } from "./task-state-hydrate-runtime.js";
import type { TaskStore } from "./store.js";
import {
  expectedTaskVersionsForTaskIds,
  isGitTaskStateCanonicalAuthority,
  readCanonicalPublishQueueMode
} from "./task-state-canonical-authority.js";

export type CanonicalCommitInput = {
  ctx: ModuleLifecycleContext;
  store: TaskStore;
  planning?: OpenedPlanningStores;
  events: TaskStateEventV1[];
  planningEvents?: PlanningStateEventV1[];
  policyApproval?: { confirmed: boolean; rationale: string };
  /** When false, publish only (no local SQLite projection refresh). */
  applyProjection?: boolean;
};

function allPublishEvents(input: CanonicalCommitInput): CanonicalStateEventV1[] {
  return [...input.events, ...(input.planningEvents ?? [])];
}

function touchedTaskIds(events: CanonicalStateEventV1[]): Set<string> {
  const ids = new Set<string>();
  for (const event of events) {
    if (!isTaskStateEvent(event)) {
      continue;
    }
    for (const id of taskIdsTouchedByEvent(event)) {
      ids.add(id);
    }
  }
  return ids;
}

async function enqueueCanonicalTaskStateEvents(
  input: CanonicalCommitInput,
  events: CanonicalStateEventV1[],
  expectedTaskVersions: Record<string, number>,
  touchedIds: string[]
): Promise<ModuleCommandResult> {
  let transientPlanning: OpenedPlanningStores | undefined;
  try {
    const planning = input.planning ?? (await openPlanningStores(input.ctx));
    transientPlanning = input.planning ? undefined : planning;
    const repository = createCanonicalEventOutboxRepository(planning);
    let insertedCount = 0;
    const eventIds: string[] = [];
    for (const event of events) {
      const enqueue = repository.enqueueCanonicalEvent(event, { expectedTaskVersions, touchedTaskIds: touchedIds });
      if (enqueue.inserted) {
        insertedCount += 1;
      }
      eventIds.push(enqueue.row.eventId);
    }

    // queue-mode must still durably persist local task/planning mutations
    await input.store.save();
    await input.store.load();
    const outbox = repository.getOutboxStatus();
    return {
      ok: true,
      code: "task-state-canonical-enqueued",
      message: `Queued ${events.length} canonical event(s) for async publish`,
      data: {
        schemaVersion: 1,
        pending: true,
        queuedMode: true,
        queuedCount: events.length,
        insertedCount,
        dedupedCount: Math.max(0, events.length - insertedCount),
        eventIds,
        outbox
      }
    };
  } catch (error) {
    return {
      ok: false,
      code: "task-state-canonical-enqueue-failed",
      message: `Failed to enqueue canonical events: ${(error as Error).message}`,
      data: { schemaVersion: 1, pending: true, queuedMode: true }
    };
  } finally {
    transientPlanning?.sqliteDual.closeDatabase();
  }
}

export async function commitCanonicalTaskStateEvents(
  input: CanonicalCommitInput
): Promise<ModuleCommandResult | null> {
  if (!isGitTaskStateCanonicalAuthority(input.ctx)) {
    return null;
  }

  const publishEvents = allPublishEvents(input);
  const touched = touchedTaskIds(publishEvents);
  const touchedIds = [...touched];
  const storeVersions = expectedTaskVersionsForTaskIds(input.store, touched);
  const queueMode = readCanonicalPublishQueueMode(input.ctx.effectiveConfig as Record<string, unknown>);
  if (queueMode) {
    return enqueueCanonicalTaskStateEvents(input, publishEvents, storeVersions, touchedIds);
  }

  const branch = TASK_STATE_GIT_BRANCH;
  const backend = createGitEventLogBackendFromContext(input.ctx, { branch });
  const head = await backend.readHead();
  if (isCanonicalSyncHeadFailure(head)) {
    return {
      ok: false,
      code: "task-state-branch-missing",
      message: `Canonical branch ${branch} is missing; run task-state-init before mutating tasks`,
      data: { schemaVersion: 1, pending: false }
    };
  }

  const fetched = await backend.fetchEvents({ refresh: false });
  const remoteVersions: Map<string, number> = fetched.ok
    ? new Map(fetched.taskVersions.map((row: { taskId: string; version: number }) => [row.taskId, row.version]))
    : new Map();
  const expectedTaskVersions = expectedVersionsForPublish(storeVersions, remoteVersions, touched);

  const publish = await publishEventsViaGitBackend(backend, {
    events: publishEvents,
    expectedHead: {
      backendRevision: head.backendRevision,
      latestSequence: head.latestSequence
    },
    expectedTaskVersions
  });

  if (!publish.ok) {
    const pending = publish.code === "task-state-publish-push-failed";
    return {
      ok: false,
      code: publish.code === "task-state-publish-task-conflict" ? "task-state-stale-version" : "task-state-canonical-publish-failed",
      message: publish.message,
      data: {
        schemaVersion: 1,
        pending,
        queuedMode: false,
        ...(publish.data ?? {})
      }
    };
  }

  if (input.applyProjection === false) {
    return {
      ok: true,
      code: "task-state-canonical-published",
      message: `Published ${publish.publishedEvents.length} canonical event(s)`,
      data: {
        schemaVersion: 1,
        headSha: publish.headSha,
        publishedCount: publish.publishedEvents.length
      }
    };
  }

  const hydrate = await runTaskStateHydrate(input.ctx, { fetch: false, dryRun: false, branch });
  if (!hydrate.ok) {
    return {
      ok: false,
      code: "task-state-canonical-hydrate-failed",
      message: `Published to git but local projection refresh failed: ${hydrate.message}`,
      data: { schemaVersion: 1, publishHeadSha: publish.headSha, hydrate }
    };
  }

  await input.store.load();
  const hydrateData = hydrate.data as Record<string, unknown> | undefined;
  return {
    ok: true,
    code: "task-state-canonical-committed",
    message: `Published and applied ${publish.publishedEvents.length} canonical event(s)`,
    data: {
      schemaVersion: 1,
      headSha: publish.headSha,
      publishedCount: publish.publishedEvents.length,
      appliedSequence:
        typeof hydrateData?.remoteLatestSequence === "number"
          ? hydrateData.remoteLatestSequence
          : publish.publishedEvents.at(-1)?.sequence
    }
  };
}

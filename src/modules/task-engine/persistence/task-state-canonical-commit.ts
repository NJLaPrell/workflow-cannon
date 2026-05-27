import type { ModuleCommandResult, ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import { remoteBranchHeadSha, resolveTaskStateGitRef } from "../task-state-git/git-io.js";
import { TASK_STATE_GIT_BRANCH } from "../task-state-git/constants.js";
import { publishTaskStateEvents, taskIdsTouchedByEvent } from "../task-state-git/publish-task-state-events.js";
import {
  expectedVersionsForPublish,
  readRemoteTaskVersionMap
} from "../task-state-git/remote-projection-versions.js";
import type { TaskStateEventV1 } from "../task-state-events/event-payloads.js";
import type { OpenedPlanningStores } from "./planning-open.js";
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
  policyApproval?: { confirmed: boolean; rationale: string };
  /** When false, publish only (no local SQLite projection refresh). */
  applyProjection?: boolean;
};

function touchedTaskIds(events: TaskStateEventV1[]): Set<string> {
  const ids = new Set<string>();
  for (const event of events) {
    for (const id of taskIdsTouchedByEvent(event)) {
      ids.add(id);
    }
  }
  return ids;
}

export async function commitCanonicalTaskStateEvents(
  input: CanonicalCommitInput
): Promise<ModuleCommandResult | null> {
  if (!isGitTaskStateCanonicalAuthority(input.ctx)) {
    return null;
  }

  const queueMode = readCanonicalPublishQueueMode(input.ctx.effectiveConfig as Record<string, unknown>);
  if (queueMode) {
    return {
      ok: false,
      code: "task-state-canonical-queue-not-implemented",
      message:
        "Canonical publish queue mode is enabled but not implemented; disable tasks.canonicalPublishQueue.enabled or retry without queue",
      data: { schemaVersion: 1, pending: true, queuedMode: true }
    };
  }

  const branch = TASK_STATE_GIT_BRANCH;
  const workspacePath = input.ctx.workspacePath;
  const resolved = resolveTaskStateGitRef(workspacePath, branch);
  if ("missing" in resolved) {
    const remoteSha = remoteBranchHeadSha(workspacePath, branch);
    if (!remoteSha) {
      return {
        ok: false,
        code: "task-state-branch-missing",
        message: `Canonical branch ${branch} is missing; run task-state-init before mutating tasks`,
        data: { schemaVersion: 1, pending: false }
      };
    }
  }

  const headSha =
    "missing" in resolved ? remoteBranchHeadSha(workspacePath, branch)! : resolved.tipSha;
  const touched = touchedTaskIds(input.events);
  const storeVersions = expectedTaskVersionsForTaskIds(input.store, touched);
  const remoteVersions =
    "missing" in resolved
      ? new Map<string, number>()
      : readRemoteTaskVersionMap(workspacePath, resolved.ref, resolved.tipSha);
  const expectedTaskVersions = expectedVersionsForPublish(storeVersions, remoteVersions, touched);

  const publish = await publishTaskStateEvents({
    workspacePath,
    branch,
    events: input.events,
    expectedHeadSha: headSha,
    expectedTaskVersions,
    push: true
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

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { admitTaskStateEventStream } from "../task-state-events/event-admission.js";
import type { TaskStateEventV1 } from "../task-state-events/event-payloads.js";
import type { TaskStateProjectionV1 } from "../task-state-events/projection-types.js";
import { TASK_STATE_GIT_BRANCH, TASK_STATE_MANIFEST_RELATIVE } from "./constants.js";
import {
  gitFetchTaskStateBranch,
  isGitRepository,
  remoteBranchHeadSha,
  removeGitWorktree,
  resolveTaskStateGitRef,
  runGit
} from "./git-io.js";
import { segmentIndexForSequence } from "./layout.js";
import { computeManifestDigest } from "./validate-manifest.js";
import type { TaskStateGitManifestV1 } from "./types.js";
import {
  readEventSegmentsJsonl,
  readTaskStateBranchLayout,
  segmentPathsThroughHead
} from "./read-branch-layout.js";
import {
  admitRemoteEventStream,
  readRemoteSnapshotProjection,
  readRemoteTaskVersionMap
} from "./remote-projection-versions.js";
import { resolveEventSegmentRelativePath } from "./layout.js";

export type PublishTaskStateEventsInput = {
  workspacePath: string;
  branch?: string;
  events: TaskStateEventV1[];
  /** Tip SHA the writer observed before building events (after fetch). */
  expectedHeadSha: string;
  /** Per-task version the writer observed for every task touched by `events`. */
  expectedTaskVersions: Record<string, number>;
  maxAttempts?: number;
  push?: boolean;
};

export type PublishTaskStateEventsSuccess = {
  ok: true;
  headSha: string;
  publishedEvents: TaskStateEventV1[];
  attempts: number;
  branch: string;
};

export type PublishTaskStateEventsFailure = {
  ok: false;
  code: string;
  message: string;
  data?: Record<string, unknown>;
};

export type PublishTaskStateEventsResult = PublishTaskStateEventsSuccess | PublishTaskStateEventsFailure;

export function taskIdsTouchedByEvent(event: TaskStateEventV1): string[] {
  const payload = event.payload;
  if (event.kind === "task.batch_applied" && payload && typeof payload === "object") {
    const ids = (payload as { taskIds?: unknown }).taskIds;
    return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [];
  }
  if (payload && typeof payload === "object" && "taskId" in payload) {
    const taskId = (payload as { taskId?: unknown }).taskId;
    return typeof taskId === "string" && taskId.trim() ? [taskId.trim()] : [];
  }
  return [];
}

export function taskVersionMapFromProjection(projection: TaskStateProjectionV1): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of projection.taskVersions) {
    map.set(row.taskId, row.version);
  }
  return map;
}

export function detectTaskVersionConflict(input: {
  expectedTaskVersions: Record<string, number>;
  remoteVersions: Map<string, number>;
  events: TaskStateEventV1[];
}): { taskId: string; expected: number; actual: number } | null {
  const touched = new Set<string>();
  for (const event of input.events) {
    for (const taskId of taskIdsTouchedByEvent(event)) {
      touched.add(taskId);
    }
  }
  for (const taskId of touched) {
    const expected = input.expectedTaskVersions[taskId];
    if (typeof expected !== "number" || !Number.isFinite(expected)) {
      continue;
    }
    const actual = input.remoteVersions.get(taskId) ?? 0;
    if (actual !== expected) {
      return { taskId, expected, actual };
    }
  }
  return null;
}

export function assignEventSequences(
  drafts: TaskStateEventV1[],
  head: { latestSequence: number; latestEventId: string | null }
): TaskStateEventV1[] {
  let sequence = head.latestSequence;
  let parentEventId = head.latestEventId;
  const published: TaskStateEventV1[] = [];
  for (const draft of drafts) {
    sequence += 1;
    const next: TaskStateEventV1 = {
      ...draft,
      sequence,
      parentEventId
    };
    published.push(next);
    parentEventId = next.eventId;
  }
  return published;
}

function loadRemoteEvents(
  workspacePath: string,
  ref: string,
  manifest: TaskStateGitManifestV1,
  eventSegmentPaths: string[]
): { ok: true; events: TaskStateEventV1[] } | PublishTaskStateEventsFailure {
  const paths =
    eventSegmentPaths.length > 0 ? eventSegmentPaths : segmentPathsThroughHead(manifest);
  const read = readEventSegmentsJsonl(workspacePath, ref, paths);
  if (!read.ok) {
    return { ok: false, code: read.code, message: read.message };
  }
  const raw = read.lines.map((line) => JSON.parse(line) as unknown);
  const admitted = admitRemoteEventStream(workspacePath, ref, manifest, raw);
  if (!admitted.ok) {
    return {
      ok: false,
      code: "task-state-event-admission-rejected",
      message: admitted.error.message,
      data: { admissionCode: admitted.error.code }
    };
  }
  return { ok: true, events: admitted.events };
}

const DEFAULT_EVENTS_PER_SEGMENT = 10_000;

function appendEventsToManifest(
  manifest: TaskStateGitManifestV1,
  published: TaskStateEventV1[]
): TaskStateGitManifestV1 {
  const last = published.at(-1);
  if (!last) {
    return manifest;
  }
  const latestSegmentPath = resolveEventSegmentRelativePath(
    segmentIndexForSequence(last.sequence, DEFAULT_EVENTS_PER_SEGMENT)
  );
  const next: TaskStateGitManifestV1 = {
    ...manifest,
    head: {
      latestSequence: last.sequence,
      latestEventId: last.eventId,
      latestSegmentPath,
      latestSnapshotId: manifest.head.latestSnapshotId
    }
  };
  return { ...next, manifestDigest: computeManifestDigest(next) };
}

function writeSegmentAppend(
  worktreeRoot: string,
  manifest: TaskStateGitManifestV1,
  published: TaskStateEventV1[]
): void {
  const rel =
    manifest.head.latestSegmentPath?.startsWith("task-state/")
      ? manifest.head.latestSegmentPath
      : manifest.head.latestSegmentPath
        ? `task-state/${manifest.head.latestSegmentPath}`
        : resolveEventSegmentRelativePath(0);
  const abs = path.join(worktreeRoot, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const prior = fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : "";
  const hasContent = prior.trim().length > 0 && !prior.trimStart().startsWith("#");
  const prefix = hasContent && !prior.endsWith("\n") ? "\n" : prior.length === 0 ? "" : "";
  const chunk = published.map((e) => JSON.stringify(e)).join("\n");
  fs.writeFileSync(abs, `${prior}${prefix}${chunk}\n`, "utf8");
  const manifestAbs = path.join(worktreeRoot, TASK_STATE_MANIFEST_RELATIVE);
  fs.writeFileSync(manifestAbs, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

export async function publishTaskStateEvents(
  input: PublishTaskStateEventsInput
): Promise<PublishTaskStateEventsResult> {
  const branch = input.branch?.trim() || TASK_STATE_GIT_BRANCH;
  const maxAttempts = Math.max(1, input.maxAttempts ?? 3);
  const push = input.push !== false;

  if (!isGitRepository(input.workspacePath)) {
    return { ok: false, code: "not-a-git-repo", message: "publish requires a git workspace" };
  }
  if (!Array.isArray(input.events) || input.events.length === 0) {
    return { ok: false, code: "invalid-run-args", message: "events must be a non-empty array" };
  }
  const expectedHeadSha = input.expectedHeadSha?.trim();
  if (!expectedHeadSha) {
    return { ok: false, code: "invalid-run-args", message: "expectedHeadSha is required" };
  }

  let lastPushStderr: string | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const fetch = gitFetchTaskStateBranch(input.workspacePath, branch);
    if (!fetch.ok) {
      return {
        ok: false,
        code: "task-state-fetch-failed",
        message: fetch.stderr || "git fetch failed",
        data: { attempt }
      };
    }

    const resolved = resolveTaskStateGitRef(input.workspacePath, branch);
    if ("missing" in resolved) {
      return {
        ok: false,
        code: "task-state-branch-missing",
        message: `Branch ${branch} is not available locally after fetch`
      };
    }

    const layoutRead = readTaskStateBranchLayout(
      input.workspacePath,
      resolved.ref,
      resolved.tipSha
    );
    if (!layoutRead.ok) {
      return { ok: false, code: layoutRead.code, message: layoutRead.message };
    }

    const remoteLoaded = loadRemoteEvents(
      input.workspacePath,
      resolved.ref,
      layoutRead.layout.manifest,
      layoutRead.layout.eventSegmentPaths
    );
    if (!remoteLoaded.ok) {
      return remoteLoaded;
    }

    const remoteVersions = readRemoteTaskVersionMap(input.workspacePath, resolved.ref, resolved.tipSha);
    const versionConflict = detectTaskVersionConflict({
      expectedTaskVersions: input.expectedTaskVersions,
      remoteVersions,
      events: input.events
    });
    if (versionConflict) {
      return {
        ok: false,
        code: "task-state-publish-task-conflict",
        message: `Task ${versionConflict.taskId} version conflict: expected ${versionConflict.expected}, remote has ${versionConflict.actual}`,
        data: {
          schemaVersion: 1,
          taskId: versionConflict.taskId,
          expectedVersion: versionConflict.expected,
          actualVersion: versionConflict.actual,
          remoteHeadSha: resolved.tipSha,
          expectedHeadSha
        }
      };
    }

    const headMoved = resolved.tipSha !== expectedHeadSha;
    const publishedEvents = assignEventSequences(input.events, layoutRead.layout.manifest.head);
    const headProjection = readRemoteSnapshotProjection(
      input.workspacePath,
      resolved.ref,
      resolved.tipSha
    );
    // `readRemoteSnapshotProjection` already replays the remote tail on the bootstrap snapshot.
    // Seeding admission with both that head projection and `remoteLoaded.events` would replay tail twice.
    const admitted = admitTaskStateEventStream(publishedEvents, {
      priorEvents: headProjection ? [] : remoteLoaded.events,
      initialProjection: headProjection ?? undefined
    });
    if (!admitted.ok) {
      return {
        ok: false,
        code: "task-state-event-admission-rejected",
        message: admitted.error.message,
        data: { admissionCode: admitted.error.code }
      };
    }

    const nextManifest = appendEventsToManifest(layoutRead.layout.manifest, publishedEvents);
    const worktreePath = fs.mkdtempSync(path.join(os.tmpdir(), "wk-task-state-publish-"));
    const remoteShaForLease = resolved.tipSha;

    try {
      const addWt = runGit(input.workspacePath, [
        "worktree",
        "add",
        "--detach",
        worktreePath,
        resolved.ref
      ]);
      if (!addWt.ok) {
        return {
          ok: false,
          code: "task-state-worktree-failed",
          message: addWt.stderr || addWt.stdout || "worktree add failed"
        };
      }

      writeSegmentAppend(worktreePath, nextManifest, publishedEvents);
      runGit(worktreePath, ["add", "task-state"]);
      const commit = runGit(worktreePath, [
        "commit",
        "-m",
        `chore(task-state): append ${publishedEvents.length} event(s)`
      ]);
      if (!commit.ok) {
        return {
          ok: false,
          code: "task-state-publish-commit-failed",
          message: commit.stderr || commit.stdout || "commit failed"
        };
      }
      const commitSha = runGit(worktreePath, ["rev-parse", "HEAD"]).stdout.trim();
      if (!push) {
        runGit(input.workspacePath, ["branch", "-f", branch, commitSha]);
        return {
          ok: true,
          headSha: commitSha,
          publishedEvents,
          attempts: attempt,
          branch
        };
      }

      const leaseRef = `refs/heads/${branch}`;
      const pushed = runGit(input.workspacePath, [
        "push",
        `--force-with-lease=${leaseRef}:${remoteShaForLease}`,
        "origin",
        `${commitSha}:${branch}`
      ]);
      if (pushed.ok) {
        return {
          ok: true,
          headSha: commitSha,
          publishedEvents,
          attempts: attempt,
          branch
        };
      }
      lastPushStderr = pushed.stderr || pushed.stdout;
      const retryable =
        headMoved ||
        /rejected|stale|fetch first|non-fast-forward/i.test(lastPushStderr ?? "");
      if (!retryable || attempt >= maxAttempts) {
        return {
          ok: false,
          code: "task-state-publish-push-failed",
          message: lastPushStderr ?? "git push failed",
          data: { attempt, headMoved, remoteHeadSha: remoteShaForLease }
        };
      }
    } finally {
      removeGitWorktree(input.workspacePath, worktreePath);
    }
  }

  return {
    ok: false,
    code: "task-state-publish-exhausted-retries",
    message: lastPushStderr ?? "publish retries exhausted",
    data: { maxAttempts }
  };
}

/** Git-backed canonical event log publisher (Phase 115 S5.1). */
export class GitTaskEventStore {
  constructor(
    private readonly workspacePath: string,
    private readonly branch: string = TASK_STATE_GIT_BRANCH
  ) {}

  publish(
    input: Omit<PublishTaskStateEventsInput, "workspacePath" | "branch">
  ): Promise<PublishTaskStateEventsResult> {
    return publishTaskStateEvents({
      workspacePath: this.workspacePath,
      branch: this.branch,
      ...input
    });
  }
}

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import {
  CANONICAL_STATE_SYNC_BACKEND_CONTRACT_VERSION,
  type CanonicalStateCompactResult,
  type CanonicalStateEventEnvelopeV1,
  type CanonicalStateHead,
  type CanonicalStateSnapshotResult,
  type CanonicalStateSyncDiagnostics,
  type CanonicalStateVerifyResult,
  type CanonicalPlanningVersionRow,
  type CanonicalSyncFailure,
  type CanonicalTaskVersionRow,
  type FetchEventsInput,
  type FetchEventsResult,
  type PublishEventsInput,
  type PublishEventsResult
} from "../../../contracts/canonical-state-sync-backend.js";
import type { CanonicalStateEventV1 } from "../task-state-events/canonical-state-events.js";
import { TASK_STATE_GIT_BRANCH, TASK_STATE_MANIFEST_RELATIVE, TASK_STATE_ROOT_DIR } from "../task-state-git/constants.js";
import { digestTaskStateCanonicalJson } from "../task-state-git/integrity.js";
import {
  gitFetchTaskStateBranch,
  isGitRepository,
  removeGitWorktree,
  resolveTaskStateGitRef,
  runGit
} from "../task-state-git/git-io.js";
import { resolveSnapshotContentRelativePath, resolveSnapshotMetaRelativePath } from "../task-state-git/layout.js";
import {
  publishTaskStateEvents,
  type PublishTaskStateEventsResult
} from "../task-state-git/publish-task-state-events.js";
import {
  readEventSegmentsJsonl,
  readTaskStateBranchLayout,
  segmentPathsThroughHead,
  type TaskStateBranchLayout
} from "../task-state-git/read-branch-layout.js";
import {
  admitRemoteEventStream,
  readRemoteSnapshotProjection,
  replayPlanningProjectionFromRawEvents
} from "../task-state-git/remote-projection-versions.js";
import type { TaskStateSnapshotContentV1 } from "../task-state-git/snapshot-projection.js";
import type { TaskStateGitManifestV1, TaskStateGitSnapshotMetaV1 } from "../task-state-git/types.js";
import { computeManifestDigest } from "../task-state-git/validate-manifest.js";
import { verifyTaskStateLayoutOnDisk } from "../task-state-git/verify-layout.js";
import {
  assertCanonicalStateSyncBackend,
  type CanonicalStateCompactInput,
  type CanonicalStateSnapshotInput,
  type CanonicalStateSyncBackend,
  type CanonicalSyncHeadFailure,
  toCanonicalStateEventEnvelope
} from "./canonical-state-sync-backend.js";

export type GitEventLogBackendOptions = {
  workspacePath: string;
  branch?: string;
  buildSnapshotContent?: () => TaskStateSnapshotContentV1 | Promise<TaskStateSnapshotContentV1>;
};

export const GIT_EVENT_LOG_BACKEND_ID = "git-event-log" as const;

function gitDiagnostics(layout: TaskStateBranchLayout, extra?: Record<string, unknown>): CanonicalStateSyncDiagnostics {
  return {
    git: {
      branch: layout.manifest.branch,
      ref: layout.ref,
      tipSha: layout.tipSha,
      ...extra
    }
  };
}

function headFromLayout(layout: TaskStateBranchLayout): CanonicalStateHead {
  return {
    contractVersion: CANONICAL_STATE_SYNC_BACKEND_CONTRACT_VERSION,
    latestSequence: layout.manifest.head.latestSequence,
    latestEventId: layout.manifest.head.latestEventId,
    backendRevision: layout.tipSha,
    latestSnapshotId: layout.manifest.head.latestSnapshotId,
    recordedAt: new Date().toISOString()
  };
}

function syncFailure(
  code: string,
  message: string,
  retryable: boolean,
  diagnostics?: CanonicalStateSyncDiagnostics,
  conflict?: CanonicalSyncFailure["conflict"]
): CanonicalSyncFailure {
  return { ok: false, code, message, retryable, diagnostics, conflict };
}

function taskVersionsFromProjection(
  projection: { taskVersions: { taskId: string; version: number }[] } | null
): CanonicalTaskVersionRow[] {
  if (!projection) {
    return [];
  }
  return projection.taskVersions.map((row) => ({ taskId: row.taskId, version: row.version }));
}

function planningVersionsFromRawEvents(rawEvents: unknown[]): CanonicalPlanningVersionRow[] {
  const projection = replayPlanningProjectionFromRawEvents(rawEvents);
  return [{ domain: "workspace", version: projection.workspaceStatus?.workspaceRevision ?? 0 }];
}

function mapPublishFailure(result: Extract<PublishTaskStateEventsResult, { ok: false }>): PublishEventsResult {
  const data = result.data ?? {};
  const taskId = typeof data.taskId === "string" ? data.taskId : undefined;
  const conflict =
    result.code === "task-state-publish-task-conflict" && taskId
      ? {
          code: result.code,
          message: result.message,
          retryable: false,
          taskId,
          expectedVersion: typeof data.expectedVersion === "number" ? data.expectedVersion : undefined,
          actualVersion: typeof data.actualVersion === "number" ? data.actualVersion : undefined,
          diagnostics: { git: { remoteHeadSha: data.remoteHeadSha, expectedHeadSha: data.expectedHeadSha } }
        }
      : undefined;
  const retryable =
    result.code === "task-state-fetch-failed" ||
    result.code === "task-state-publish-push-failed" ||
    result.code === "task-state-publish-exhausted-retries";
  return syncFailure(result.code, result.message, retryable, { git: data }, conflict);
}

function materializeGitLayoutToTemp(
  workspacePath: string,
  ref: string
): { ok: true; tempRoot: string; layout: TaskStateBranchLayout } | { ok: false; code: string; message: string } {
  const tipSha = runGit(workspacePath, ["rev-parse", ref]).stdout.trim();
  const layoutRead = readTaskStateBranchLayout(workspacePath, ref, tipSha);
  if (!layoutRead.ok) {
    return layoutRead;
  }

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "wk-git-event-log-verify-"));
  const segmentPaths =
    layoutRead.layout.eventSegmentPaths.length > 0
      ? layoutRead.layout.eventSegmentPaths
      : segmentPathsThroughHead(layoutRead.layout.manifest);

  const manifestText = runGit(workspacePath, ["show", `${ref}:${TASK_STATE_ROOT_DIR}/manifest.json`]).stdout;
  if (!manifestText) {
    return { ok: false, code: "task-state-manifest-missing", message: "Could not read manifest from git ref" };
  }
  fs.mkdirSync(path.join(tempRoot, TASK_STATE_ROOT_DIR), { recursive: true });
  fs.writeFileSync(path.join(tempRoot, TASK_STATE_ROOT_DIR, "manifest.json"), `${manifestText}\n`, "utf8");

  const eventsRead = readEventSegmentsJsonl(workspacePath, ref, segmentPaths);
  if (!eventsRead.ok) {
    return { ok: false, code: eventsRead.code, message: eventsRead.message };
  }

  for (const segmentPath of segmentPaths) {
    const show = runGit(workspacePath, ["show", `${ref}:${segmentPath}`]);
    if (!show.ok) {
      return { ok: false, code: "task-state-event-segment-missing", message: `Missing segment ${segmentPath}` };
    }
    const abs = path.join(tempRoot, segmentPath);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    const text = show.stdout;
    fs.writeFileSync(abs, text.endsWith("\n") ? text : `${text ? `${text}\n` : ""}`, "utf8");
  }

  const snapshotId = layoutRead.layout.manifest.head.latestSnapshotId;
  if (snapshotId) {
    for (const rel of [
      `${TASK_STATE_ROOT_DIR}/snapshots/${snapshotId}.json`,
      `${TASK_STATE_ROOT_DIR}/snapshots/${snapshotId}.meta.json`
    ]) {
      const show = runGit(workspacePath, ["show", `${ref}:${rel}`]);
      if (show.ok && show.stdout) {
        const abs = path.join(tempRoot, rel);
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, show.stdout.endsWith("\n") ? show.stdout : `${show.stdout}\n`, "utf8");
      }
    }
  }

  return { ok: true, tempRoot, layout: layoutRead.layout };
}

export class GitEventLogBackend implements CanonicalStateSyncBackend {
  readonly backendId = GIT_EVENT_LOG_BACKEND_ID;

  constructor(private readonly options: GitEventLogBackendOptions) {}

  private get workspacePath(): string {
    return this.options.workspacePath;
  }

  private get branch(): string {
    return this.options.branch?.trim() || TASK_STATE_GIT_BRANCH;
  }

  private resolveLayout(
    refresh: boolean
  ):
    | { ok: true; layout: TaskStateBranchLayout }
    | { ok: false; failure: CanonicalSyncHeadFailure | CanonicalSyncFailure } {
    if (!isGitRepository(this.workspacePath)) {
      return {
        ok: false,
        failure: { ok: false, code: "not-a-git-repo", message: "Git event log backend requires a git workspace", retryable: false }
      };
    }
    if (refresh) {
      const fetch = gitFetchTaskStateBranch(this.workspacePath, this.branch);
      if (!fetch.ok) {
        return {
          ok: false,
          failure: syncFailure("task-state-fetch-failed", fetch.stderr || "git fetch failed", true, {
            git: { branch: this.branch }
          })
        };
      }
    }
    const resolved = resolveTaskStateGitRef(this.workspacePath, this.branch);
    if ("missing" in resolved) {
      return {
        ok: false,
        failure: syncFailure(
          "task-state-branch-missing",
          `Canonical branch ${this.branch} is not available`,
          true,
          { git: { branch: this.branch, tried: resolved.tried } }
        )
      };
    }
    const layoutRead = readTaskStateBranchLayout(this.workspacePath, resolved.ref, resolved.tipSha);
    if (!layoutRead.ok) {
      return {
        ok: false,
        failure: syncFailure(layoutRead.code, layoutRead.message, false, {
          git: { branch: this.branch, ref: resolved.ref }
        })
      };
    }
    return { ok: true, layout: layoutRead.layout };
  }

  async readHead(): Promise<CanonicalStateHead | CanonicalSyncHeadFailure> {
    const resolved = this.resolveLayout(false);
    return resolved.ok ? headFromLayout(resolved.layout) : resolved.failure;
  }

  async fetchEvents(input: FetchEventsInput = {}): Promise<FetchEventsResult> {
    const resolved = this.resolveLayout(input.refresh === true);
    if (!resolved.ok) {
      return resolved.failure;
    }
    const { layout } = resolved;
    const segmentPaths =
      layout.eventSegmentPaths.length > 0 ? layout.eventSegmentPaths : segmentPathsThroughHead(layout.manifest);
    const eventsRead = readEventSegmentsJsonl(this.workspacePath, layout.ref, segmentPaths);
    if (!eventsRead.ok) {
      return syncFailure(eventsRead.code, eventsRead.message, false, gitDiagnostics(layout, { segmentPaths }));
    }

    const rawEvents = eventsRead.lines.map((line) => JSON.parse(line) as unknown);
    const admitted = admitRemoteEventStream(this.workspacePath, layout.ref, layout.manifest, rawEvents);
    if (!admitted.ok) {
      return syncFailure("task-state-event-admission-rejected", admitted.error.message, false, gitDiagnostics(layout), {
        code: admitted.error.code,
        message: admitted.error.message,
        retryable: false
      });
    }

    const afterSequence = typeof input.afterSequence === "number" ? input.afterSequence : -1;
    const throughSequence =
      typeof input.throughSequence === "number" ? input.throughSequence : layout.manifest.head.latestSequence;
    let events = admitted.events.filter(
      (event) => event.sequence > afterSequence && event.sequence <= throughSequence
    );
    if (typeof input.limit === "number" && input.limit > 0) {
      events = events.slice(0, input.limit);
    }

    const remoteProjection = readRemoteSnapshotProjection(this.workspacePath, layout.ref, layout.tipSha);
    return {
      ok: true,
      head: headFromLayout(layout),
      events: events.map((event) => toCanonicalStateEventEnvelope(event)),
      taskVersions: taskVersionsFromProjection(remoteProjection),
      planningVersions: planningVersionsFromRawEvents(rawEvents),
      diagnostics: gitDiagnostics(layout, {
        segmentCount: segmentPaths.length,
        rawLineCount: eventsRead.lines.length,
        rawLines: eventsRead.lines
      })
    };
  }

  async publishEvents(input: PublishEventsInput): Promise<PublishEventsResult> {
    const result = await publishTaskStateEvents({
      workspacePath: this.workspacePath,
      branch: this.branch,
      events: input.events as CanonicalStateEventV1[],
      expectedHeadSha: input.expectedHead.backendRevision,
      expectedTaskVersions: input.expectedTaskVersions,
      maxAttempts: input.maxAttempts,
      push: true
    });
    if (!result.ok) {
      return mapPublishFailure(result);
    }
    const layoutResolved = this.resolveLayout(false);
    const head =
      layoutResolved.ok && layoutResolved.layout.tipSha === result.headSha
        ? headFromLayout(layoutResolved.layout)
        : {
            contractVersion: CANONICAL_STATE_SYNC_BACKEND_CONTRACT_VERSION,
            latestSequence:
              result.publishedEvents.at(-1)?.sequence ??
              input.expectedHead.latestSequence + result.publishedEvents.length,
            latestEventId: result.publishedEvents.at(-1)?.eventId ?? null,
            backendRevision: result.headSha,
            latestSnapshotId: layoutResolved.ok ? layoutResolved.layout.manifest.head.latestSnapshotId : null,
            recordedAt: new Date().toISOString()
          };
    return {
      ok: true,
      head,
      publishedEvents: result.publishedEvents.map((event) => toCanonicalStateEventEnvelope(event)),
      attempts: result.attempts,
      diagnostics: { git: { branch: result.branch, headSha: result.headSha } }
    };
  }

  async verify(): Promise<CanonicalStateVerifyResult> {
    const resolved = this.resolveLayout(false);
    if (!resolved.ok) {
      return {
        passed: false,
        findingCount: 1,
        findings: [{ code: resolved.failure.code, message: resolved.failure.message }],
        diagnostics: "diagnostics" in resolved.failure ? resolved.failure.diagnostics : undefined
      };
    }

    let tempRoot: string | null = null;
    try {
      const materialized = materializeGitLayoutToTemp(this.workspacePath, resolved.layout.ref);
      if (!materialized.ok) {
        return {
          passed: false,
          findingCount: 1,
          findings: [{ code: materialized.code, message: materialized.message }],
          diagnostics: { git: { branch: this.branch, ref: resolved.layout.ref } }
        };
      }
      tempRoot = materialized.tempRoot;
      const verifyResult = verifyTaskStateLayoutOnDisk(tempRoot);
      return {
        passed: verifyResult.passed,
        findingCount: verifyResult.findingCount,
        findings: verifyResult.findings.map((finding) => ({
          code: String(finding.code),
          message: finding.message,
          path: finding.path
        })),
        diagnostics: gitDiagnostics(resolved.layout, { source: `git:${resolved.layout.ref}` })
      };
    } finally {
      if (tempRoot) {
        fs.rmSync(tempRoot, { recursive: true, force: true });
      }
    }
  }

  async compact(input: CanonicalStateCompactInput = {}): Promise<CanonicalStateCompactResult> {
    const dryRun = input.dryRun !== false;
    const resolved = this.resolveLayout(false);
    if (!resolved.ok) {
      return {
        ok: false,
        code: resolved.failure.code,
        message: resolved.failure.message,
        dryRun,
        latestSequence: 0,
        latestSnapshotId: null,
        retainedEventSegmentCount: 0,
        diagnostics: "diagnostics" in resolved.failure ? resolved.failure.diagnostics : undefined
      };
    }
    const segmentCount = resolved.layout.eventSegmentPaths.length;
    if (!dryRun) {
      return {
        ok: false,
        code: "task-state-compact-apply-not-implemented",
        message: "Compaction apply is not implemented; run with dryRun:true (default) to review retention plan",
        dryRun,
        latestSequence: resolved.layout.manifest.head.latestSequence,
        latestSnapshotId: resolved.layout.manifest.head.latestSnapshotId,
        retainedEventSegmentCount: segmentCount,
        diagnostics: gitDiagnostics(resolved.layout)
      };
    }
    return {
      ok: true,
      code: "task-state-compact-dry-run",
      message: "Compaction dry-run: retention plan computed",
      dryRun: true,
      latestSequence: resolved.layout.manifest.head.latestSequence,
      latestSnapshotId: resolved.layout.manifest.head.latestSnapshotId,
      retainedEventSegmentCount: segmentCount,
      diagnostics: gitDiagnostics(resolved.layout)
    };
  }

  async snapshot(input: CanonicalStateSnapshotInput = {}): Promise<CanonicalStateSnapshotResult> {
    const dryRun = input.dryRun === true;
    const snapshotId =
      typeof input.snapshotId === "string" && input.snapshotId.trim()
        ? input.snapshotId.trim()
        : `snap-${new Date().toISOString().replace(/[:.]/g, "-")}`;
    const resolved = this.resolveLayout(false);
    if (!resolved.ok) {
      return {
        ok: false,
        code: resolved.failure.code,
        message: resolved.failure.message,
        dryRun,
        snapshotId,
        throughSequence: 0,
        throughEventId: "none",
        contentDigest: "",
        head: {
          contractVersion: CANONICAL_STATE_SYNC_BACKEND_CONTRACT_VERSION,
          latestSequence: 0,
          latestEventId: null,
          backendRevision: "",
          latestSnapshotId: null,
          recordedAt: new Date().toISOString()
        },
        diagnostics: "diagnostics" in resolved.failure ? resolved.failure.diagnostics : undefined
      };
    }
    if (!this.options.buildSnapshotContent) {
      return {
        ok: false,
        code: "snapshot-content-unavailable",
        message: "GitEventLogBackend.snapshot requires buildSnapshotContent in backend options",
        dryRun,
        snapshotId,
        throughSequence: resolved.layout.manifest.head.latestSequence,
        throughEventId: resolved.layout.manifest.head.latestEventId ?? "none",
        contentDigest: "",
        head: headFromLayout(resolved.layout),
        diagnostics: gitDiagnostics(resolved.layout)
      };
    }

    const snapshotContent = await this.options.buildSnapshotContent();
    const contentDigest = digestTaskStateCanonicalJson(snapshotContent);
    const throughSequence = resolved.layout.manifest.head.latestSequence;
    const throughEventId = resolved.layout.manifest.head.latestEventId ?? "none";
    const head = headFromLayout(resolved.layout);

    if (dryRun) {
      return {
        ok: true,
        code: "task-state-snapshot-dry-run",
        message: "Dry run: would write snapshot files on canonical branch",
        dryRun: true,
        snapshotId,
        throughSequence,
        throughEventId,
        contentDigest,
        taskCount: snapshotContent.tasks.length,
        head,
        diagnostics: gitDiagnostics(resolved.layout)
      };
    }

    const snapshotMeta: TaskStateGitSnapshotMetaV1 = {
      schemaVersion: 1,
      snapshotId,
      throughSequence,
      throughEventId,
      recordedAt: new Date().toISOString(),
      contentPath: resolveSnapshotContentRelativePath(snapshotId),
      contentDigest,
      taskCount: snapshotContent.tasks.length
    };
    const nextManifest: TaskStateGitManifestV1 = {
      ...resolved.layout.manifest,
      head: { ...resolved.layout.manifest.head, latestSnapshotId: snapshotId }
    };
    nextManifest.manifestDigest = computeManifestDigest(nextManifest);

    const worktreePath = fs.mkdtempSync(path.join(os.tmpdir(), "wk-git-event-log-snapshot-"));
    try {
      const add = runGit(this.workspacePath, ["worktree", "add", "--detach", worktreePath, resolved.layout.ref]);
      if (!add.ok) {
        return {
          ok: false,
          code: "task-state-worktree-failed",
          message: add.stderr || add.stdout || "worktree add failed",
          dryRun: false,
          snapshotId,
          throughSequence,
          throughEventId,
          contentDigest,
          taskCount: snapshotContent.tasks.length,
          head,
          diagnostics: gitDiagnostics(resolved.layout)
        };
      }
      const contentAbs = path.join(worktreePath, resolveSnapshotContentRelativePath(snapshotId));
      const metaAbs = path.join(worktreePath, resolveSnapshotMetaRelativePath(snapshotId));
      const manifestAbs = path.join(worktreePath, TASK_STATE_MANIFEST_RELATIVE);
      for (const abs of [contentAbs, metaAbs]) {
        fs.mkdirSync(path.dirname(abs), { recursive: true });
      }
      fs.writeFileSync(contentAbs, `${JSON.stringify(snapshotContent, null, 2)}\n`, "utf8");
      fs.writeFileSync(metaAbs, `${JSON.stringify(snapshotMeta, null, 2)}\n`, "utf8");
      fs.writeFileSync(manifestAbs, `${JSON.stringify(nextManifest, null, 2)}\n`, "utf8");
      runGit(worktreePath, ["add", "task-state"]);
      const commit = runGit(worktreePath, ["commit", "-m", `chore(task-state): snapshot ${snapshotId}`]);
      if (!commit.ok) {
        return {
          ok: false,
          code: "task-state-snapshot-commit-failed",
          message: commit.stderr || commit.stdout || "commit failed",
          dryRun: false,
          snapshotId,
          throughSequence,
          throughEventId,
          contentDigest,
          taskCount: snapshotContent.tasks.length,
          head,
          diagnostics: gitDiagnostics(resolved.layout)
        };
      }
      const commitSha = runGit(worktreePath, ["rev-parse", "HEAD"]).stdout.trim();
      runGit(this.workspacePath, ["branch", "-f", this.branch, commitSha]);
      const push = runGit(this.workspacePath, ["push", "-u", "origin", this.branch]);
      if (!push.ok) {
        return {
          ok: false,
          code: "task-state-snapshot-push-failed",
          message: push.stderr || push.stdout || "push failed",
          dryRun: false,
          snapshotId,
          throughSequence,
          throughEventId,
          contentDigest,
          taskCount: snapshotContent.tasks.length,
          head: { ...head, backendRevision: commitSha, latestSnapshotId: snapshotId },
          diagnostics: gitDiagnostics(resolved.layout, { headSha: commitSha })
        };
      }
      return {
        ok: true,
        code: "task-state-snapshot-created",
        message: `Created snapshot ${snapshotId} on ${this.branch}`,
        dryRun: false,
        snapshotId,
        throughSequence,
        throughEventId,
        contentDigest,
        taskCount: snapshotContent.tasks.length,
        head: { ...head, backendRevision: commitSha, latestSnapshotId: snapshotId },
        diagnostics: gitDiagnostics(resolved.layout, { headSha: commitSha })
      };
    } finally {
      removeGitWorktree(this.workspacePath, worktreePath);
    }
  }
}

export function createGitEventLogBackend(options: GitEventLogBackendOptions): GitEventLogBackend {
  const backend = new GitEventLogBackend(options);
  assertCanonicalStateSyncBackend(backend);
  return backend;
}

export function createGitEventLogBackendFromContext(
  ctx: ModuleLifecycleContext,
  overrides: Partial<Omit<GitEventLogBackendOptions, "workspacePath">> = {}
): GitEventLogBackend {
  return createGitEventLogBackend({ workspacePath: ctx.workspacePath, ...overrides });
}

export function envelopesToCanonicalEvents(events: CanonicalStateEventEnvelopeV1[]): CanonicalStateEventV1[] {
  return events as CanonicalStateEventV1[];
}

export async function publishEventsViaGitBackend(
  backend: GitEventLogBackend,
  input: Omit<PublishEventsInput, "events"> & { events: CanonicalStateEventV1[] }
): Promise<PublishTaskStateEventsResult> {
  const result = await backend.publishEvents({
    events: envelopesToCanonicalEvents(input.events),
    expectedHead: input.expectedHead,
    expectedTaskVersions: input.expectedTaskVersions,
    expectedPlanningVersions: input.expectedPlanningVersions,
    maxAttempts: input.maxAttempts
  });
  if (result.ok) {
    return {
      ok: true,
      headSha: result.head.backendRevision,
      publishedEvents: result.publishedEvents as CanonicalStateEventV1[],
      attempts: result.attempts,
      branch: String((result.diagnostics?.git as { branch?: string } | undefined)?.branch ?? TASK_STATE_GIT_BRANCH)
    };
  }
  return {
    ok: false,
    code: result.code,
    message: result.message,
    data: {
      ...(result.diagnostics?.git as Record<string, unknown> | undefined),
      ...(result.conflict
        ? {
            taskId: result.conflict.taskId,
            expectedVersion: result.conflict.expectedVersion,
            actualVersion: result.conflict.actualVersion
          }
        : {})
    }
  };
}

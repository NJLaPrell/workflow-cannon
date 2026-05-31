/**
 * Compatibility map: current Git task-state commands → CanonicalStateSyncBackend methods.
 * T100617 wraps these call sites behind GitEventLogBackend; this note is the T100616 evidence.
 */

export type GitMethodCompatEntry = {
  backendMethod: keyof GitBackendMethodMap;
  gitSources: readonly string[];
  notes: string;
};

export type GitBackendMethodMap = {
  readHead: "readTaskStateBranchLayout → manifest.head + tipSha as backendRevision";
  fetchEvents: "readEventSegmentsJsonl + admitRemoteEventStream (+ optional gitFetchTaskStateBranch when refresh)";
  publishEvents: "publishTaskStateEvents (expectedHeadSha → expectedHead.backendRevision)";
  verify: "verifyTaskStateLayoutInWorkspace / runTaskStateVerify";
  compact: "runTaskStateCompact";
  snapshot: "runTaskStateSnapshot";
};

/** CLI/runtime flows that compose backend methods but are not on the interface. */
export type GitDerivedCommandMap = {
  "task-sync-status": "readHead + local projection meta + outbox → TaskSyncStatusV1";
  "task-sync-hydrate": "fetchEvents (+ snapshot tail) then apply to SQLite/JSONL cache";
  "task-sync-publish": "outbox drain → publishEvents";
};

export const GIT_EVENT_LOG_BACKEND_COMPAT: readonly GitMethodCompatEntry[] = [
  {
    backendMethod: "readHead",
    gitSources: [
      "src/modules/task-engine/task-state-git/read-branch-layout.ts",
      "src/modules/task-engine/persistence/task-state-status-runtime.ts"
    ],
    notes: "manifest.head.latestSequence/latestEventId/latestSnapshotId; backendRevision = branch tip SHA."
  },
  {
    backendMethod: "fetchEvents",
    gitSources: [
      "src/modules/task-engine/task-state-git/read-branch-layout.ts",
      "src/modules/task-engine/task-state-git/remote-projection-versions.ts",
      "src/modules/task-engine/persistence/task-state-hydrate-runtime.ts"
    ],
    notes: "JSONL segments through head; taskVersions/planningVersions from replayed projection."
  },
  {
    backendMethod: "publishEvents",
    gitSources: ["src/modules/task-engine/task-state-git/publish-task-state-events.ts"],
    notes: "Optimistic concurrency via expectedHeadSha and expectedTaskVersions; conflicts surface retryable failures."
  },
  {
    backendMethod: "verify",
    gitSources: [
      "src/modules/task-engine/task-state-git/verify-layout.ts",
      "src/modules/task-engine/persistence/task-state-verify-runtime.ts"
    ],
    notes: "Layout integrity findings; Git branch/ref/sha only in diagnostics."
  },
  {
    backendMethod: "compact",
    gitSources: ["src/modules/task-engine/persistence/task-state-compact-runtime.ts"],
    notes: "Retention dry-run against manifest.retention; apply not yet implemented."
  },
  {
    backendMethod: "snapshot",
    gitSources: ["src/modules/task-engine/persistence/task-state-snapshot-runtime.ts"],
    notes: "Materializes snapshot blob + meta; updates manifest.head.latestSnapshotId on push."
  }
] as const;

export const GIT_DERIVED_COMMAND_COMPAT: Readonly<
  Record<keyof GitDerivedCommandMap, { sources: readonly string[]; notes: string }>
> = {
  "task-sync-status": {
    sources: ["src/modules/task-engine/persistence/task-state-status-runtime.ts"],
    notes: "Maps remoteLatestSequence/localAppliedSequence to TaskSyncStatusV1.syncState."
  },
  "task-sync-hydrate": {
    sources: ["src/modules/task-engine/persistence/task-state-hydrate-runtime.ts"],
    notes: "Uses fetchEvents semantics; local apply is outside the backend interface."
  },
  "task-sync-publish": {
    sources: ["src/modules/task-engine/persistence/task-state-publish-runtime.ts"],
    notes: "Drains canonical event outbox then calls publishEvents."
  }
};

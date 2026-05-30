# Task-state sync path inventory (T100602 / T-BE-001)

**Status:** Phase 123 delivery artifact — maps current git-event-log publish behavior before outbox work (T100603+).

**Authority:** When `tasks.canonicalAuthority` is `git-event-log`, canonical history lives on branch `workflow-cannon/task-state`. Local `.workspace-kit/tasks/workspace-kit.db` is a projection; `.workspace-kit/tasks/task-state-events.jsonl` is a materialization target.

## Central publish pipeline

All mutation-time publication flows through **`commitCanonicalTaskStateEvents`** (`src/modules/task-engine/persistence/task-state-canonical-commit.ts`):

1. Gate on `isGitTaskStateCanonicalAuthority` — no-op when authority is `sqlite`.
2. Reject when `tasks.canonicalPublishQueue.enabled` is true (`task-state-canonical-queue-not-implemented` — outbox hook reserved for Phase 123).
3. Resolve branch tip → **`expectedHeadSha`** via `resolveTaskStateGitRef` / `remoteBranchHeadSha`.
4. Compute **`expectedTaskVersions`** from local store + remote projection (`expectedTaskVersionsForTaskIds`, `readRemoteTaskVersionMap`, `expectedVersionsForPublish`).
5. Call **`publishTaskStateEvents`** with `push: true` (blocks on Git fetch/commit/push).
6. On success, **`runTaskStateHydrate`** (`fetch: false`) refreshes local SQLite projection unless `applyProjection: false`.

**`publishTaskStateEvents`** (`src/modules/task-engine/task-state-git/publish-task-state-events.ts`):

- Uses worktree under temp dir; commits JSONL segments to `workflow-cannon/task-state`.
- Honors **`expectedHeadSha`** and **`expectedTaskVersions`** for optimistic concurrency.
- Retries on unrelated concurrent push; fails fast on `task-state-publish-task-conflict`.
- **`push: false`** supported for dry/local tests only.

## Mutation commands — synchronous Git publish (blocks)

When git-event-log authority is active, these commands **block on Git publication** before returning success. Failure codes include `task-state-stale-version`, `task-state-canonical-publish-failed`, `task-state-branch-missing`.

| Command | Hook | Event kinds |
| --- | --- | --- |
| `run-transition` | `run-transition-on-command.ts` → `commitCanonicalTaskStateEvents` | Task transition events from `draftEventsFromTransitionResult` |
| `create-task` | `task-row-mutation-commands.ts` → `finalizeCanonicalCreateTask` | `task.created` |
| `create-task-from-plan` | same | `task.created` |
| `update-task` | `task-row-mutation-commands.ts` → `finalizeCanonicalUpdateTask` | `task.updated` |
| `apply-task-batch` | `apply-task-batch-command.ts` → `commitCanonicalTaskStateEvents` | Batch task events |
| `convert-phase-note-to-task` | `phase-journal-convert-command.ts` → `commitCanonicalTaskStateEvents` | Task + planning events |
| `assign-task-phase` | `task-engine-phase-mutations.ts` → `finalizeCanonicalUpdateTask` | `task.updated` |
| `clear-task-phase` | same | `task.updated` |

**Planning-domain mutations** (via `commitCanonicalPlanningEvents` → same commit path):

| Command / runtime | Source file |
| --- | --- |
| `set-current-phase` | `workspace-status-commands-runtime.ts` |
| `update-workspace-status` | `workspace-status-commands-runtime.ts` |
| Phase catalog mutations | `phase-catalog-commands-runtime.ts` |
| `add-phase-note` and related journal writes | `phase-journal-planning-events-runtime.ts` |
| Module state planning events | `module-state-planning-events-runtime.ts` |
| Ideas CRUD (when enabled) | `ideas/ideas-planning-events-runtime.ts` |
| `planning-state-migrate-baseline` | `planning-state-migrate-baseline-runtime.ts` |

Domain filtering: `filterPlanningEventsByEnabledDomains` (`planning-canonical-sync-domains.ts`) — only enabled domains publish.

## Explicit operator sync commands (not mutation hot path)

| Command | Runtime | Blocks on Git? | Role |
| --- | --- | --- | --- |
| `task-state-publish` | `task-state-publish-runtime.ts` | Yes (`push` default) | Manual/explicit publish of pending local events |
| `task-state-hydrate` | `task-state-hydrate-runtime.ts` | Fetch optional | Pull remote events → local projection |
| `task-state-status` | `task-state-status-runtime.ts` | No (read-only unless `fetch:true`) | Alignment cursor for CLI/dashboard |
| `task-state-verify` | `task-state-verify-runtime.ts` | No | Integrity check against git source |
| `task-state-snapshot` | `task-state-snapshot-runtime.ts` | No | Snapshot export |
| `task-state-init` | `task-state-init-runtime.ts` | Yes (bootstrap branch) | First-time branch setup |
| `task-state-compact` | `task-state-compact-runtime.ts` | Yes | Segment compaction |
| `task-state-migrate-baseline` | `task-state-migrate-baseline-runtime.ts` | Yes | Baseline migration |
| `apply-task-state-events` | `apply-task-state-events-runtime.ts` | No | Local projection apply |
| `rebuild-task-state-cache` | `rebuild-task-state-cache-runtime.ts` | No | Local rebuild |
| `repair-task-state-cache` | `repair-task-state-cache-runtime.ts` | No | Local repair |

## Sync vs deferred publish

| Path | Behavior today |
| --- | --- |
| Mutation commands (table above) | **Synchronous** publish + hydrate on success path |
| `task-state-publish` | **Explicit** synchronous publish (operator/recovery) |
| `tasks.canonicalPublishQueue.enabled` | **Stub** — returns `task-state-canonical-queue-not-implemented` (Phase 123 outbox replaces this) |
| Dashboard background sync | Extension `task-state-sync-coordinator` may call `task-state-hydrate` after mutations — does not replace canonical publish on mutation path |

## `expectedHeadSha` / `expectedTaskVersions` usage

- Set in **`commitCanonicalTaskStateEvents`** immediately before each mutation publish.
- **`publishTaskStateEvents`** validates head SHA matches branch tip and task versions match remote projection for touched task IDs.
- **`task-state-publish`** (operator command) builds expected versions from local store + remote read (`task-state-publish-runtime.ts`).
- Conflict surface: `task-state-publish-task-conflict`, `task-state-stale-version`.

## Test files protecting existing behavior

| Area | Test file(s) |
| --- | --- |
| Git publish core | `test/git-task-event-store-publish.test.mjs` |
| Phase canonical publish integration | `test/task-phase-canonical-publish.test.mjs` |
| Hydrate / status | `test/task-state-status-hydrate.test.mjs` |
| Planning git sync (phase 120) | `test/planning-git-sync-phase120-integration.test.mjs` |
| Module command routing | `test/module-command-router.test.mjs` |
| Git policy hooks | `test/git-policy-hooks.test.mjs` |
| Dashboard: no hydrate on read path | `extensions/cursor-workflow-cannon/test/dashboard-no-task-state-fetch.test.mjs` |
| Extension sync coordinator | `extensions/cursor-workflow-cannon/test/task-state-sync-coordinator.test.mjs` |
| Command client mutation paths | `extensions/cursor-workflow-cannon/test/command-client.test.mjs` |

## Phase 123 outbox target (T100603–T100608)

Replace step 5–6 in **`commitCanonicalTaskStateEvents`** with:

1. Local SQLite transaction (immediate).
2. **`enqueueCanonicalEvent`** to `kit_canonical_event_outbox`.
3. Background publisher calls **`publishTaskStateEvents`** in batches.
4. `task-state-status` / dashboard expose outbox + sync posture.

See `BACKEND.md` Phase 1 WBS and plan artifact `de3064a4-9995-4b27-94a9-1512523c1757`.

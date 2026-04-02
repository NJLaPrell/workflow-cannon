# Task Engine Schema Workbook

Design workbook for Phase 1 Task Engine core. All decisions in this document are binding for T184–T217 implementation.

**Maintainer-canonical** prose. **Machine dialect:** `.ai/workbooks/task-engine-workbook.md` (sync via the documentation module per `src/modules/documentation/RULES.md`).

## Design Decisions (resolved)

| Decision | Choice | Rationale |
| --- | --- | --- |
| Scope | Dogfood on own tasks + design API for external consumers | Proves the engine on real work while keeping the contract general |
| Task-state role | Engine-owned canonical task store (default **SQLite** planning row; JSON file opt-out) | Engine owns execution state directly; see `tasks.persistenceBackend` |
| Persistence | Default SQLite (`workspace_planning_state.task_store_json`); optional JSON at `.workspace-kit/tasks/state.json` when `tasks.persistenceBackend: json` | Durable between runs; aligns with unified planning DB |
| Agent integration | Full: CLI dispatch + instruction files + engine reads context and suggests next actions | Agents need discoverability, not just raw dispatch |
| Dependency behavior | Auto-unblock: dependents move `blocked → ready` when all deps complete | Reduces manual bookkeeping, matches how we actually work |
| Guard complexity | Full guards: state validation + dependency checks + custom guard hooks | Hooks let modules register pre-transition validators from day one |
| Task types | Type field present, all types share the same lifecycle in Phase 1 | Avoids premature complexity; adapter-per-type comes in Phase 4 |
| State file format | JSON | Consistent with parity evidence, schema validation, and tooling |
| Human surface | Task-engine commands (`list-tasks`, `get-next-actions`) over canonical state | Operator workflow uses command/query surfaces instead of markdown mirrors |
| Next-action intelligence | Ready queue sorted by priority with blocking chain analysis | Context-aware recommendations deferred to Phase 3 Enhancement Engine |
| Evidence | Every transition produces a timestamped evidence record | Consistent with the evidence-first pattern established in Phase 0 |
| Migration | One-time migration from markdown tracking into engine-owned state | Ongoing execution persists via task commands (SQLite default or JSON opt-out) |

---

## 1. State Model

Six core lifecycle states, fixed in Phase 1 (extensibility deferred):

```
proposed → ready → in_progress → completed
    ↑        ↓
  demote    → blocked → ready (unblock)
            → cancelled (per transition table)
```

### State Definitions

| State | Meaning | Entry condition |
| --- | --- | --- |
| `proposed` | Task has been identified but not accepted for execution | Task creation |
| `ready` | Task is accepted and all dependencies are satisfied | Accept from proposed, unblock from blocked, pause from in_progress |
| `in_progress` | Task is actively being worked | Start from ready |
| `blocked` | Task cannot proceed; waiting on dependencies or external condition | Block from ready or in_progress |
| `completed` | Task is done; acceptance criteria met | Complete from in_progress |
| `cancelled` | Task has been rejected or abandoned | Cancel from proposed, ready, or blocked |

---

## 2. Transition Graph

### Allowed Transitions

| From | To | Action verb | Guard conditions | Reversible? |
| --- | --- | --- | --- | --- |
| `proposed` | `ready` | accept | none | no (re-propose requires new task) |
| `proposed` | `cancelled` | reject | none | no |
| `ready` | `proposed` | demote | none | yes (via accept) |
| `ready` | `in_progress` | start | `dependency-check`: all deps must be `completed` | yes (via pause) |
| `ready` | `blocked` | block | none | yes (via unblock) |
| `ready` | `cancelled` | cancel | none | no |
| `in_progress` | `completed` | complete | none | no |
| `in_progress` | `blocked` | block | none | yes (via unblock) |
| `in_progress` | `ready` | pause | none | yes (via start) |
| `blocked` | `ready` | unblock | all `dependsOn` tasks must be `completed` | yes (via block) |
| `blocked` | `cancelled` | cancel | none | no |

### Disallowed Transitions (non-exhaustive, all others rejected)

Any transition not in the allowed list above produces an `invalid-transition` error. Notable examples:

- `completed → *` (terminal state)
- `cancelled → *` (terminal state)
- `proposed → in_progress` (must go through ready)
- `proposed → blocked` (must go through ready)
- `blocked → in_progress` (must go through ready)
- `blocked → completed` (must go through in_progress)

---

## 3. Entity Schema

### TaskEntity

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | `string` | yes | Format: `T{number}` (e.g., `T184`). Unique within store. |
| `status` | `TaskStatus` | yes | One of the six lifecycle states |
| `type` | `string` | yes | Task type label. Uniform lifecycle in Phase 1; adapter-per-type in Phase 4. |
| `title` | `string` | yes | Human-readable task title |
| `createdAt` | `string` (ISO 8601) | yes | Creation timestamp |
| `updatedAt` | `string` (ISO 8601) | yes | Last-modified timestamp |
| `priority` | `"P1" \| "P2" \| "P3"` | no | Priority level for queue ordering |
| `dependsOn` | `string[]` | no | Task IDs this task depends on |
| `unblocks` | `string[]` | no | Task IDs this task unblocks (derived/informational) |
| `phase` | `string` | no | Phase grouping label |
| `metadata` | `Record<string, unknown>` | no | Arbitrary key-value metadata |
| `ownership` | `string` | no | Owner or assignee label |
| `approach` | `string` | no | Implementation approach description |
| `technicalScope` | `string[]` | no | List of technical scope bullet points |
| `acceptanceCriteria` | `string[]` | no | List of acceptance criteria bullet points |

### TaskStatus enum

```typescript
type TaskStatus = "proposed" | "ready" | "in_progress" | "blocked" | "completed" | "cancelled";
```

### TaskPriority type

```typescript
type TaskPriority = "P1" | "P2" | "P3";
```

---

## 4. Guard Hook Contract

### TransitionGuard interface

```typescript
type GuardResult = {
  allowed: boolean;
  code?: string;
  message?: string;
};

type TransitionGuard = {
  name: string;
  canTransition: (task: TaskEntity, targetState: TaskStatus, context: TransitionContext) => GuardResult;
};

type TransitionContext = {
  allTasks: TaskEntity[];
  timestamp: string;
  actor?: string;
};
```

### Guard execution model

- Guards run in registration order.
- First rejection stops the chain; subsequent guards are not evaluated.
- Guard results are recorded in transition evidence regardless of outcome.

### Built-in Guards

| Guard name | Behavior |
| --- | --- |
| `state-validity` | Rejects transitions not in the allowed-transition map. Always runs first. |
| `dependency-check` | For `ready → in_progress` and `blocked → ready`: verifies all `dependsOn` tasks are `completed`. |

---

## 5. Persistence Contract

### Store location

JSON opt-out: `.workspace-kit/tasks/state.json` (when `tasks.persistenceBackend: json`). Default kit layout uses SQLite (`.workspace-kit/tasks/workspace-kit.db`) with embedded JSON documents — see **`docs/maintainers/runbooks/task-persistence-operator.md`**.

Configurable via `src/modules/task-engine/config.md` / `tasks` keys.

### Store schema

```typescript
type TaskStoreDocument = {
  schemaVersion: 1;
  tasks: TaskEntity[];
  transitionLog: TransitionEvidence[];
  mutationLog?: TaskMutationEvidence[];
  lastUpdated: string;
};
```

### Behavior

- **Load**: Read and parse on engine initialization. If file does not exist, initialize with empty state.
- **Save**: Write after each transition batch (atomic: write to temp file, rename).
- **Schema version**: **`normalizeTaskStoreDocumentFromUnknown`** (`src/modules/task-engine/task-store-migration.ts`) accepts read versions **`1`** and **`2`** (v2 is currently a no-op forward label); runtime normalizes to **`schemaVersion: 1`** and saves **`1`** until a release explicitly bumps the writer. Policy: **`docs/maintainers/ADR-task-store-schemaversion-policy.md`**.
- **Directory creation**: Auto-create `.workspace-kit/tasks/` directory if missing.

---

## 6. Evidence Schema

Every transition (including auto-unblocks) produces a `TransitionEvidence` record.

```typescript
type TransitionEvidence = {
  transitionId: string;
  taskId: string;
  fromState: TaskStatus;
  toState: TaskStatus;
  action: string;
  guardResults: GuardResult[];
  dependentsUnblocked: string[];
  timestamp: string;
  actor?: string;
};
```

### Fields

| Field | Description |
| --- | --- |
| `transitionId` | Unique ID per transition (`${taskId}-${timestamp}-${random}`) |
| `taskId` | The task being transitioned |
| `fromState` | State before transition |
| `toState` | State after transition |
| `action` | The action verb (accept, start, complete, etc.) |
| `guardResults` | Array of guard evaluation results |
| `dependentsUnblocked` | IDs of tasks auto-unblocked by this transition |
| `timestamp` | ISO 8601 timestamp |
| `actor` | Optional: who/what triggered the transition |

---

## 7. Error Taxonomy

Typed error codes for deterministic failure handling:

| Code | Meaning | When |
| --- | --- | --- |
| `invalid-transition` | Disallowed state change (from → to not in allowed map) | Transition validation |
| `guard-rejected` | A guard returned `allowed: false` | Guard evaluation |
| `dependency-unsatisfied` | dependsOn tasks are not all completed | dependency-check guard |
| `task-not-found` | Task ID does not exist in store | Any operation referencing a task |
| `duplicate-task-id` | Attempting to create a task with an existing ID | Task creation |
| `invalid-task-schema` | Task entity fails schema validation | Task creation or import |
| `storage-read-error` | Failed to read state file | Store load |
| `storage-write-error` | Failed to write state file | Store save |
| `invalid-adapter` | Adapter fails capability or contract validation | Adapter registration |

---

## 8. CLI Commands

Commands exposed via module command router (`workspace-kit run <command>`):

| Command | Args | Returns | Description |
| --- | --- | --- | --- |
| `run-transition` | `{ taskId: string, action: string, actor?: string }` | `TransitionEvidence` | Execute a validated state transition |
| `get-task` | `{ taskId: string }` | `TaskEntity` | Retrieve a single task by ID |
| `list-tasks` | `{ status?: TaskStatus, phase?: string }` | `TaskEntity[]` | List tasks with optional filters |
| `get-ready-queue` | `{}` | `TaskEntity[]` | Get all tasks in `ready` state, sorted by priority |
| `get-next-actions` | `{}` | `NextActionSuggestion` | Priority-sorted ready queue with blocking chain analysis |

---

## 9. Canonical task state

The task system persists canonical execution state in `.workspace-kit/tasks/state.json`.

This JSON state is the single source of truth for:

- task lifecycle status
- dependency relationships
- phase assignment
- transition evidence and history

---

## 10. Migration Strategy

Migration from markdown task tracking is complete. New execution tracking changes must be made directly in `.workspace-kit/tasks/state.json` through task-system commands and transitions.

---

## 11. Next-Action Suggestion Engine

### get-next-actions output

```typescript
type NextActionSuggestion = {
  readyQueue: TaskEntity[];
  suggestedNext: TaskEntity | null;
  stateSummary: {
    proposed: number;
    ready: number;
    in_progress: number;
    blocked: number;
    completed: number;
    cancelled: number;
    total: number;
  };
  blockingAnalysis: {
    taskId: string;
    blockedBy: string[];
    blockingCount: number;
  }[];
};
```

### Behavior

- Ready queue sorted by priority (P1 first, then P2, P3, then no priority).
- `suggestedNext` is the first item in the sorted ready queue (or null if empty).
- `stateSummary` counts tasks in each state.
- `blockingAnalysis` identifies which blocked tasks are waiting on what, sorted by `blockingCount` descending (most-blocking first).

---

## 12. Phase 13 lifecycle-tightening contract (T311-T318)

Phase 13 extends the core lifecycle design with explicit mutation/query commands so maintainers and UI clients no longer depend on direct task-state file edits.

### Command set additions

- `create-task`: validated task creation (`id`, `title`, optional metadata) with deterministic schema checks.
- `update-task`: controlled updates for mutable fields only.
- `archive-task`: soft-delete behavior (`archived`, `archivedAt`) with active queue exclusion by default.
- `add-dependency` / `remove-dependency`: explicit dependency graph mutation.
- `get-dependency-graph`: machine-usable graph output (`nodes`, `edges`) plus task-centric view when `taskId` is provided.
- `get-task-history` / `get-recent-task-activity`: merged transition + mutation evidence stream, newest-first, deterministic cap.
- `get-task-summary` / `get-blocked-summary`: dedicated dashboard-grade summary commands.
- `create-task-from-plan`: creation bridge that preserves planning provenance via `metadata.planRef`.

### Mutable vs immutable fields

- Immutable through `update-task`: `id`, `createdAt`, `status`.
- Mutable through `update-task`: `title`, `type`, `priority`, `dependsOn`, `unblocks`, `phase`, `metadata`, `ownership`, `approach`, `technicalScope`, `acceptanceCriteria`.
- Status changes remain transition-only via `run-transition`.

### Evidence model extension

- Non-transition writes append to `mutationLog` with `TaskMutationEvidence`.
- Evidence shape includes `mutationId`, `mutationType`, `taskId`, `timestamp`, optional `actor`, optional structured `details`.
- History queries merge `transitionLog` + `mutationLog` into one chronological stream.

### Archival semantics

- Archival is non-destructive: task record stays in state file.
- Active queue/suggestion/summary commands exclude archived tasks by default.
- `list-tasks` supports `includeArchived: true` for diagnostics and audit retrieval.

### Error taxonomy additions

- `invalid-task-update`: immutable field mutation requested.
- `invalid-task-id-format`: task ID does not follow `T<number>`.
- `task-archived`: command references an archived task when active-only behavior is required.
- `dependency-cycle`: invalid self-edge or cycle mutation.
- `duplicate-dependency`: dependency edge already present.

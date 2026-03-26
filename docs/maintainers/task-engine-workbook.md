# Task Engine Schema Workbook

Design workbook for Phase 1 Task Engine core. All decisions in this document are binding for T184–T217 implementation.

## Design Decisions (resolved)

| Decision | Choice | Rationale |
| --- | --- | --- |
| Scope | Dogfood on own tasks + design API for external consumers | Proves the engine on real work while keeping the contract general |
| .workspace-kit/tasks/state.json role | **Replaced** by the engine; becomes a generated read-only view | Engine owns state; generated markdown preserves the human surface |
| Persistence | File-backed JSON in `.workspace-kit/tasks/state.json` (configurable via module config) | Durable between runs, easy to inspect, consistent with existing kit state |
| Agent integration | Full: CLI dispatch + instruction files + engine reads context and suggests next actions | Agents need discoverability, not just raw dispatch |
| Dependency behavior | Auto-unblock: dependents move `blocked → ready` when all deps complete | Reduces manual bookkeeping, matches how we actually work |
| Guard complexity | Full guards: state validation + dependency checks + custom guard hooks | Hooks let modules register pre-transition validators from day one |
| Task types | Type field present, all types share the same lifecycle in Phase 1 | Avoids premature complexity; adapter-per-type comes in Phase 4 |
| State file format | JSON | Consistent with parity evidence, schema validation, and tooling |
| Human surface | Generated `.workspace-kit/tasks/state.json` as read-only view (same pattern as doc module) | Keeps the existing doc surface alive without it being source of truth |
| Next-action intelligence | Ready queue sorted by priority with blocking chain analysis | Context-aware recommendations deferred to Phase 3 Enhancement Engine |
| Evidence | Every transition produces a timestamped evidence record | Consistent with the evidence-first pattern established in Phase 0 |
| Migration | One-time parser imports current .workspace-kit/tasks/state.json into new state format | .workspace-kit/tasks/state.json then becomes a generated view |

---

## 1. State Model

Six core lifecycle states, fixed in Phase 1 (extensibility deferred):

```
proposed → ready → in_progress → completed
                → blocked      → ready (unblock)
                → cancelled
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

Default: `.workspace-kit/tasks/state.json`

Configurable via `src/modules/task-engine/config.md` `storePath` setting.

### Store schema

```typescript
type TaskStoreDocument = {
  schemaVersion: 1;
  tasks: TaskEntity[];
  transitionLog: TransitionEvidence[];
  lastUpdated: string;
};
```

### Behavior

- **Load**: Read and parse on engine initialization. If file does not exist, initialize with empty state.
- **Save**: Write after each transition batch (atomic: write to temp file, rename).
- **Schema version**: Version `1` for Phase 1. Future versions will include migration logic.
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

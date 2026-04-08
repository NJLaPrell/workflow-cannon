# agent-session-snapshot

Read-only composed JSON for agent session reload: planning generation, suggested next task, queue-health summary, canonical phase alignment, doctor phase mismatch codes, and open team assignments.

## Usage

```
workspace-kit run agent-session-snapshot '{}'
```

## Arguments

Empty object `{}` (optional `config` / `actor` passthrough like other read-only task-engine commands).

## Behavior

- **No writes** — Tier C; no `policyApproval`.
- **Deterministic fields** — `schemaVersion` **1** on `data`; includes `planningGeneration` / `planningGenerationPolicy` via standard policy meta.
- Prefer this over chaining `doctor` + `list-tasks` + `get-next-actions` + `queue-health` when you only need a reload bundle.

## Response

| Field | Description |
| --- | --- |
| `schemaVersion` | **1** |
| `refreshedAt` | ISO timestamp |
| `suggestedNext` | `id` / `title` / `status` or `null` |
| `stateSummary` | Task counts (same as `get-next-actions`) |
| `queueHealthSummary` | Compact summary from `queue-health` |
| `canonicalPhase` | Phase resolution snapshot |
| `doctorKitPhaseIssues` | Non-empty when **`kit.currentPhaseNumber`** disagrees with **`kit_workspace_status.current_kit_phase`** (SQLite v10+); codes **`kit-phase-config-workspace-status-mismatch`** / **`kit-workspace-status-row-missing`** |
| `teamExecutionContext` | Open team assignments (read-only) |

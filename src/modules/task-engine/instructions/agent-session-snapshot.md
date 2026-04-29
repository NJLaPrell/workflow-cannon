<!--
agentCapsule|v=1|command=agent-session-snapshot|module=task-engine|schema_only=pnpm exec wk run agent-session-snapshot --schema-only '{}'
-->

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
- For a focused phase answer, use **`phase-status`**; for phase mutation, use **`set-current-phase`** rather than patching config, YAML, and SQLite separately.

## Response

| Field | Description |
| --- | --- |
| `schemaVersion` | **1** |
| `refreshedAt` | ISO timestamp |
| `suggestedNext` | `id` / `title` / `status` or `null` |
| `stateSummary` | Task counts (same as `get-next-actions`) |
| `queueHealthSummary` | Compact summary from `queue-health` |
| `canonicalPhase` | Phase resolution snapshot |
| `doctorKitPhaseIssues` | Usually empty; severe workspace-status problems surface via **`workspace-kit doctor`**. See **`canonicalPhase.phaseSource`** / **`configMatchesWorkspaceStatus`** for config vs DB informational drift |
| `teamExecutionContext` | Open team assignments (read-only) |

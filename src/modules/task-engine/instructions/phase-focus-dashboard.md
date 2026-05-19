<!--
agentCapsule|v=1|command=phase-focus-dashboard|module=task-engine|schema_only=pnpm exec wk run phase-focus-dashboard --schema-only '{}'
-->

# phase-focus-dashboard

Read-only: one bounded JSON answer for a **scoped phase** — ready queue ids, blocked dependency reasons, journal note counts, and delivery evidence gaps — without pulling the full `dashboard-summary` payload.

## Usage

```bash
workspace-kit run phase-focus-dashboard '{}'
workspace-kit run phase-focus-dashboard '{"phaseKey":"100"}'
```

## Arguments

| Field | Type | Notes |
| --- | --- | --- |
| `phaseKey` | string | Optional. Defaults to workspace canonical phase (`kit_workspace_status.current_kit_phase`). |

## Response

`data` matches **`AgentPhaseFocusDashboard`** (`schemaVersion` 1) — see `schemas/agent-phase-focus-dashboard-contract.v1.json` and `@workflow-cannon/workspace-kit/contracts/agent-phase-focus-dashboard-contract`.

| Slice | Description |
| --- | --- |
| `canonicalPhase` | Canonical phase key + workspace pointers |
| `queue` | Task counts in the phase by status |
| `delivery` | Closeout / progress summary for phase delivery tasks |
| `readyTop` | Up to 15 ready task ids (priority sort) |
| `blockedTop` | Up to 10 blocked tasks with `blockedBy` and optional `blockedReasonCategory` |
| `phaseJournal` | Active note count, critical count, silence warning |
| `evidenceGaps` | `phase-delivery-preflight` violation rollup (top rows) |

## Related

- Full cockpit: `dashboard-summary`
- Phase discovery: `phase-status`
- Cold start: `agent-bootstrap` with `"projection":"phaseFocus"` (same `data.phaseFocus` shape)

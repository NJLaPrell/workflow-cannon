# queue-health

Read-only audit of the **ready** execution queue: compares each ready task’s inferred phase key to the canonical current phase (from **`kit_workspace_status.current_kit_phase`** in planning SQLite when available, otherwise `kit.currentPhaseNumber` as a bootstrap fallback), and flags ready tasks whose `dependsOn` are not yet `completed`.

## Usage

```
workspace-kit run queue-health '{}'
```

## Arguments

None. Uses the workspace’s effective config and SQLite workspace status snapshot.

## Returns

JSON `data` includes:

- `schemaVersion` — always `1`
- `canonicalPhase` — resolution source (`workspace-status` | `config` | `none`), `canonicalPhaseKey`, `workspaceStatusPhaseKey`, `configPhaseKey`, and informational `configMatchesWorkspaceStatus` when both sides supply a phase number
- `readyTaskSummaries` — per ready task: `phaseAligned`, `blockedByDependencies`, `unmetDependencies`, `taskPhaseKey`
- `summary` — aggregate counts (`readyCount`, `misalignedPhaseCount`, `blockedByDependenciesCount`, `healthyReadyCount`)

## Related

- `workspace-kit run phase-status` — focused read-only phase, config drift, export freshness, and optional phase task counts.
- `workspace-kit doctor` — may print a non-fatal note when `kit.currentPhaseNumber` disagrees with `kit_workspace_status.current_kit_phase`; runtime readers use SQLite when present (see `.ai/runbooks/workspace-status-sqlite.md` Doctor section).
- `workspace-kit run list-tasks` with `includeQueueHints` — optional per-row hints without a second full pass in the client.

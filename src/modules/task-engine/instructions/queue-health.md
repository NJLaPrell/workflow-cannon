# queue-health

Read-only audit of the **ready** execution queue: compares each ready task’s inferred phase key to the canonical current phase (from `kit.currentPhaseNumber` when set, otherwise **`kit_workspace_status.current_kit_phase`** in planning SQLite when v10+, else no status-store fallback in this path), and flags ready tasks whose `dependsOn` are not yet `completed`.

## Usage

```
workspace-kit run queue-health '{}'
```

## Arguments

None. Uses the workspace’s effective config and maintainer status snapshot.

## Returns

JSON `data` includes:

- `schemaVersion` — always `1`
- `canonicalPhase` — resolution source (`config` | `status-yaml` | `none`), `canonicalPhaseKey`, workspace-status vs config keys (`statusYamlMatchesConfig` is the same boolean when both config and workspace snapshot supply a phase number)
- `readyTaskSummaries` — per ready task: `phaseAligned`, `blockedByDependencies`, `unmetDependencies`, `taskPhaseKey`
- `summary` — aggregate counts (`readyCount`, `misalignedPhaseCount`, `blockedByDependenciesCount`, `healthyReadyCount`)

## Related

- `workspace-kit doctor` — on SQLite v10+, fails when `kit.currentPhaseNumber` disagrees with `kit_workspace_status.current_kit_phase` (see `.ai/runbooks/workspace-status-sqlite.md` Doctor section).
- `workspace-kit run list-tasks` with `includeQueueHints` — optional per-row hints without a second full pass in the client.

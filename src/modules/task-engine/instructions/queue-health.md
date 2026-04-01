# queue-health

Read-only audit of the **ready** execution queue: compares each ready task’s inferred phase key to the canonical current phase (from `kit.currentPhaseNumber` when set, otherwise `docs/maintainers/data/workspace-kit-status.yaml`), and flags ready tasks whose `dependsOn` are not yet `completed`.

## Usage

```
workspace-kit run queue-health '{}'
```

## Arguments

None. Uses the workspace’s effective config and maintainer status snapshot.

## Returns

JSON `data` includes:

- `schemaVersion` — always `1`
- `canonicalPhase` — resolution source (`config` | `status-yaml` | `none`), `canonicalPhaseKey`, YAML vs config keys, and `statusYamlMatchesConfig` (when both sides are present)
- `readyTaskSummaries` — per ready task: `phaseAligned`, `blockedByDependencies`, `unmetDependencies`, `taskPhaseKey`
- `summary` — aggregate counts (`readyCount`, `misalignedPhaseCount`, `blockedByDependenciesCount`, `healthyReadyCount`)

## Related

- `workspace-kit doctor` — fails when `kit.currentPhaseNumber` disagrees with parsed `current_kit_phase` in the status YAML (both must be set to compare).
- `workspace-kit run list-tasks` with `includeQueueHints` — optional per-row hints without a second full pass in the client.

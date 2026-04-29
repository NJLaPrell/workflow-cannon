<!--
agentCapsule|v=1|command=task-persistence-readiness|module=task-engine|schema_only=pnpm exec wk run task-persistence-readiness --schema-only '{}'
-->

# task-persistence-readiness

Read-only migration readiness report for task persistence. Use this before schema migrations or constraint tightening so agents get stable machine-readable blockers instead of SQLite confetti.

## Usage

```
workspace-kit run task-persistence-readiness '{}'
```

## Arguments

None. The command resolves the effective workspace config and reads the configured SQLite planning DB in read-only mode.

## Returns

JSON `data` includes:

- `schemaVersion` — always `1`
- `ready` — `false` when any readiness check has severity `error`
- `dbPath` — resolved SQLite planning DB path
- `sqliteUserVersion` — current `PRAGMA user_version`, or `null` when unavailable
- `planningGeneration` — current task planning generation, or `null` for missing/first-run state
- `relationalTasks` — whether `workspace_planning_state.relational_tasks` is enabled, or `null` when unavailable
- `taskCount`, `transitionCount`, `mutationCount` — parsed row/log counts
- `checks[]` — stable check rows with `code`, `severity`, `message`, `affectedCount`, `sampleTaskIds`, and `remediation`
- `summary` — aggregate `errorCount`, `warningCount`, and `okCount`

## Stable Check Families

- SQLite availability: `sqlite-db-missing`, `sqlite-open-failed`, `sqlite-quick-check-ok`, `sqlite-quick-check-failed`
- Planning row shape: `workspace-planning-state-missing`, `workspace-planning-state-row-missing`
- Blob/envelope validity: `task-store-json-valid`, `task-store-json-invalid`, `task-envelope-logs-valid`, `task-envelope-logs-invalid`
- Relational rows: `task-engine-tasks-rows-valid`, `task-engine-tasks-rows-invalid`, `task-engine-tasks-table-absent`
- Migration drift: `task-blob-relational-count-drift`, `task-legacy-features-json-present`
- Task integrity: `task-shape-valid`, `task-shape-invalid`, `task-status-invalid`, `task-archived-flag-inconsistent`, `task-timestamps-invalid`
- Dependency integrity: `task-dependencies-target-existing-tasks`, `task-dependency-missing-target`, `task-dependency-self-reference`
- Explicit empty states: `task-store-empty`, `task-evidence-empty`

## Related

- `workspace-kit doctor` — broad environment/contract gate; may also surface persistence issues.
- `workspace-kit run migrate-task-persistence '{"direction":"sqlite-blob-to-relational","dryRun":true}'` — focused migration dry-run.
- `.ai/runbooks/task-persistence-operator.md` — storage layout and recovery map.

<!--
agentCapsule|v=1|command=phase-kickoff-readiness|module=task-engine|schema_only=pnpm exec wk run phase-kickoff-readiness --schema-only '{}'
-->

# phase-kickoff-readiness

Read-only aggregate audit before starting phase delivery. Composes planning, git, scope-path, validation, and doctor slices for a target phase.

## Usage

```
workspace-kit run phase-kickoff-readiness '{}'
workspace-kit run phase-kickoff-readiness '{"phaseKey":"137"}'
workspace-kit run phase-kickoff-readiness '{"phaseKey":"137","baseRef":"origin/main","integrationRef":"origin/release/phase-137","staleTaskDays":14,"checkScopePaths":true,"includeValidationPlans":true,"mode":"advisory"}'
```

## Arguments

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `phaseKey` | string | no | Stable phase key to audit. Defaults to canonical workspace phase from `kit_workspace_status`. |
| `baseRef` | string | no | Git ref for integration comparison. Default `origin/main`. |
| `integrationRef` | string | no | Phase integration branch ref. Default `origin/release/phase-<phaseKey>`. |
| `staleTaskDays` | number | no | Flag `ready` / `in_progress` tasks older than this many days (default `14`). |
| `checkScopePaths` | boolean | no | Run scope manifest + git staleness for up to 50 `ready` / `in_progress` / `proposed` tasks (default `true`). |
| `includeValidationPlans` | boolean | no | Embed top validation recommendations for up to 5 `ready` tasks (default `true`). |
| `mode` | string | no | `advisory` (default) or `enforce`. `enforce` treats a missing integration branch as `block` severity. |

## Returns

Success `data` includes `schemaVersion`, `phaseKey`, `passed`, `findingCount`, `findings[]`, `checkedTaskCount`, `slices` (`planning`, `git`, `scope`, `validation`, `doctor`), and `canonicalPhase`.

Each finding includes stable `code`, `severity` (`advisory` \| `warn` \| `block`), `message`, and `slice`. Scope findings may include `taskId` and `path`.

`passed` is `false` when any finding has `severity: "block"`; otherwise `true` (including advisory/warn-only findings).

This command is read-only: no `policyApproval` and no task-store or workspace-status mutations.

## Related

- `workspace-kit run phase-focus-dashboard` — bounded phase queue and evidence gap rollup.
- `workspace-kit run queue-git-alignment` — git HEAD vs transition log heuristic (embedded in `slices.git`).
- `workspace-kit run phase-closeout-readiness` — unfinished task drain audit at phase end.
- `workspace-kit run phase-delivery-preflight` — delivery evidence and stranded-work preflight before closeout.
- `workspace-kit run recommend-validation` — per-task validation plan used by the validation slice.
- **Follow-up:** dashboard Phase Roster Start should call this command before `set-current-phase` (separate task).

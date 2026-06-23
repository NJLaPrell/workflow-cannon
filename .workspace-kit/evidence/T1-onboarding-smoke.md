# T1 — Validate Workflow Cannon onboarding (smoke)

**Task:** T1  
**Phase:** 137  
**Worker:** worker-T1  
**Branch:** feature/T1-validate-workflow-cannon-onboarding  
**Date:** 2026-06-23  

## Acceptance criteria

| Criterion | Command | Exit code | Result |
|-----------|---------|-----------|--------|
| doctor passes | `pnpm exec wk doctor` | 0 | PASS |
| start prints status | `pnpm exec wk start` | 0 | PASS |
| dashboard-summary succeeds | `pnpm exec wk run dashboard-summary '{}'` | 0 | PASS |

## Command outputs

### `pnpm exec wk doctor`

```
workspace-kit doctor passed.
All canonical workspace-kit contract files are present and parseable JSON.
Runtime contract healthy: .workspace-kit/runtime.json and .workspace-kit/bin/wk.
Effective workspace config resolved; task planning persistence checks passed (including SQLite when configured).
Effective task persistence: sqlite — DB path: .workspace-kit/tasks/workspace-kit.db
Kit SQLite schema (PRAGMA user_version): 38
Note: kit.currentPhaseNumber (136) differs from kit_workspace_status (137); runtime readers use SQLite.
Native SQLite architecture status: aligned (stamp=arm64, runtime=arm64, host=arm64)
Planning generation policy: require
Active canonical backend: git, backendId=git-event-log
CAE: enabled=true persistence=true shadowPreflight=true
```

### `pnpm exec wk start`

```
workspace-kit start — workspace looks healthy.
- Doctor checks passed.
Useful commands:
  workspace-kit run agent-bootstrap '{}'
  workspace-kit run get-next-actions '{}'
  workspace-kit run dashboard-summary '{}'
```

### `pnpm exec wk run dashboard-summary '{}'`

Key fields from JSON response:

```json
{
  "ok": true,
  "code": "dashboard-summary",
  "message": "Dashboard summary built from task store and maintainer status snapshot",
  "data": {
    "schemaVersion": 7,
    "planningGeneration": 5388,
    "planningGenerationPolicy": "require",
    "workspaceStatus": {
      "currentKitPhase": "137",
      "nextKitPhase": "137",
      "activeFocus": "Phase 137 — delivery in progress",
      "blockers": [],
      "pendingDecisions": []
    }
  }
}
```

## Notes

- No config changes required; all smoke checks passed on `release/phase-137`.
- Doctor notes a non-blocking phase number mismatch in config vs SQLite (136 vs 137); runtime uses SQLite.

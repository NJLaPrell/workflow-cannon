<!--
agentCapsule|v=1|command=dashboard-ops-slice|module=task-engine|schema_only=pnpm exec wk run dashboard-ops-slice --schema-only '{}'
-->

# Dashboard Ops Slice

Lightweight "ops" snapshot that returns five fields — `planArtifact`, `workspaceStatus`,
`teamExecution`, `subagentRegistry`, and `taskCheckpoints` — **without** running the
`buildDashboardSystemStatus` doctor/CAE/git-drift scan.

Use this command instead of `dashboard-summary` with `projection: "status"` when the
caller only needs the ops-tier fields and wants to avoid the full doctor-scan cost.

## Arguments

No required arguments. The command accepts no options.

```json
{}
```

## Output shape

```json
{
  "ok": true,
  "code": "dashboard-ops-slice",
  "data": {
    "schemaVersion": 1,
    "planningGeneration": 42,
    "workspaceStatus": { ... },
    "planArtifact": { ... },
    "teamExecution": { "schemaVersion": 1, "available": true, ... },
    "subagentRegistry": { "schemaVersion": 1, "available": true, ... },
    "taskCheckpoints": { "schemaVersion": 1, "available": true, ... }
  }
}
```

## Performance notes

This command opens a read-only, skip-logs planning store (`"ops"` slice mode) and
skips the following expensive operations:

- `runPhaseStatus` (git-drift / phase-catalog scan)
- `collectDoctorContractIssues` (filesystem contract scan)
- `collectCaeDoctorSummaryLines` (CAE registry scan)

It is classified `read_hot` and does not persist a run log.

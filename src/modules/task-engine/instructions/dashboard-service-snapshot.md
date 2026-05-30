<!--
agentCapsule|v=1|command=dashboard-service-snapshot|module=task-engine|schema_only=pnpm exec wk run dashboard-service-snapshot --schema-only '{}'
-->

# dashboard-service-snapshot

Fetch the current warm `DashboardServiceSnapshot` from the running dashboard read service (`GET /dashboard/snapshot`).

## Usage

```
pnpm exec wk run dashboard-service-snapshot '{}'
```

Requires `dashboard-service-start` (or an equivalent running daemon).

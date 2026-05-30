<!--
agentCapsule|v=1|command=dashboard-service-snapshot|module=task-engine|schema_only=pnpm exec wk run dashboard-service-snapshot --schema-only '{}'
-->

# dashboard-service-snapshot

Fetch the current warm `DashboardServiceSnapshot` from the running dashboard read service (`GET /dashboard/snapshot`).

Contract alignment:

- TypeScript: `src/contracts/dashboard-snapshot.ts` (`DashboardServiceSnapshot`, slice statuses).
- JSON Schema: `schemas/dashboard-service-snapshot.v1.json`.
- Store: `src/services/dashboard-service/snapshot-store.ts` — in-memory warm cache; failed slice refresh keeps last-good `value` with `status: "error"`.

## Usage

```
pnpm exec wk run dashboard-service-snapshot '{}'
```

Requires `dashboard-service-start` (or an equivalent running daemon).

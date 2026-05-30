<!--
agentCapsule|v=1|command=dashboard-service-status|module=task-engine|schema_only=pnpm exec wk run dashboard-service-status --schema-only '{}'
-->

# dashboard-service-status

Read-only status for the dashboard read service: `workspaceRoot`, pid, port, uptime, generation, and `/health` probe. Stale pid/runtime artifacts under `.workspace-kit/dashboard-service/` are reported as not running; `dashboard-service-start` clears them before spawning.

## Usage

```
pnpm exec wk run dashboard-service-status '{}'
```

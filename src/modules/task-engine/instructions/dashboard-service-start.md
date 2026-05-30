<!--
agentCapsule|v=1|command=dashboard-service-start|module=task-engine|schema_only=pnpm exec wk run dashboard-service-start --schema-only '{}'
-->

# dashboard-service-start

Start the warm dashboard read service (HTTP/SSE on localhost). Writes `.workspace-kit/dashboard-service/runtime.json`, `service.pid`, and `service.log`.

## Usage

```
pnpm exec wk run dashboard-service-start '{}'
```

Idempotent when an existing healthy process is already running.

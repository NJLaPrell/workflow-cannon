<!--
agentCapsule|v=1|command=dashboard-bootstrap-slices|module=task-engine|schema_only=pnpm exec wk run dashboard-bootstrap-slices --schema-only '{}'
-->

# Dashboard Bootstrap Slices

Cheap multi-slice CLI read for cold dashboard paint when the warm service is unavailable.

## Default slices

When `slices` is omitted, defaults to `["overview", "queue"]`:

- `overview` — phase/status shell fields for first paint
- `queue` — rollup **counts** for overview pills (Ideas/detail hydrate later)

Optional slice names: `status`, `agentActivity`, `agentTypes`.

## Extension paint lane

The Cursor extension treats this command as a refresh/paint-lane read (`KIT_REFRESH_RUN_COMMANDS`) so cold bootstrap is not blocked behind mutation-lane task-state sync.

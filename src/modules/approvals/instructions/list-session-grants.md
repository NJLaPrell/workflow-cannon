<!--
agentCapsule|v=1|command=list-session-grants|module=approvals|schema_only=pnpm exec wk run list-session-grants --schema-only '{}'
-->

# list-session-grants

Read-only list of active session-scoped policy grants stored in **`kit_session_grants`** (unified SQLite). Legacy **`.workspace-kit/policy/session-grants.json`** is import-only.

## Example

```bash
workspace-kit run list-session-grants '{}'
```

## Response

`data.grants[]` — rows with `sessionId`, `operationId`, `rationale`, `grantedAt`, `expiresAt` (nullable).

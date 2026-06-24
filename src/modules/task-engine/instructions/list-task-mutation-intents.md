<!--
agentCapsule|v=1|command=list-task-mutation-intents|module=task-engine|schema_only=pnpm exec wk run list-task-mutation-intents --schema-only '{}'
-->

# list-task-mutation-intents

List captured task mutation intents from the git common-dir queue.

## Usage

```
workspace-kit run list-task-mutation-intents '{"limit":20}'
```

## Arguments

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `limit` | `integer` | no | Max rows returned (default **50**, max **200**). |
| `includeResolved` | `boolean` | no | When **true**, include applied and rejected intents; default lists **pending** only. |

Returns compact intent rows plus malformed-file diagnostics when present.

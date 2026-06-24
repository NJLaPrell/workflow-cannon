<!--
agentCapsule|v=1|command=reject-task-mutation-intent|module=task-engine|schema_only=pnpm exec wk run reject-task-mutation-intent --schema-only '{}'
-->

# reject-task-mutation-intent

Reject a pending worker-branch mutation intent without applying it.

## Usage

```
workspace-kit run reject-task-mutation-intent '{"intentId":"intent-abc123","reason":"superseded by direct fix on authority branch"}'
```

## Arguments

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `intentId` | `string` | yes | Pending intent id to reject. |
| `reason` | `string` | yes | Operator rationale stored on the intent. |
| `actor` | `string` | no | Recorded as resolver on the intent. |

Marks the intent **rejected**; does not mutate task store rows.

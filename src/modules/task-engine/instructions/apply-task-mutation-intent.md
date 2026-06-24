<!--
agentCapsule|v=1|command=apply-task-mutation-intent|module=task-engine|schema_only=pnpm exec wk run apply-task-mutation-intent --schema-only '{}'
-->

# apply-task-mutation-intent

Apply a pending worker-branch mutation intent on an authority branch.

## Usage

```
workspace-kit run apply-task-mutation-intent '{"intentId":"intent-abc123","expectedPlanningGeneration":42,"policyApproval":{"confirmed":true,"rationale":"apply worker intent"}}'
```

## Arguments

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `intentId` | `string` | yes | Pending intent id to apply. |
| `expectedPlanningGeneration` | `integer` or `string` | no | Forwarded to the underlying mutating command when present. |
| `policyApproval` | `object` | no | Forwarded when the requested action requires Tier A approval. |
| `actor` | `string` | no | Recorded as resolver on the intent and forwarded when supported. |

Requires authority branch posture (`release/phase-*` or disabled enforcement). Marks the intent **applied** on success.

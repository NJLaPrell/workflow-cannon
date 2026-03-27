# run-transition

Execute a validated task status transition through the Task Engine lifecycle.

## Usage

```
workspace-kit run run-transition '{"taskId":"T184","action":"start","policyApproval":{"confirmed":true,"rationale":"validate transition"}}'
```

## Arguments

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `taskId` | string | yes | The task ID to transition (e.g., `T184`) |
| `action` | string | yes | The transition action: `accept`, `reject`, `start`, `block`, `cancel`, `complete`, `pause`, `unblock` |
| `actor` | string | no | Who or what triggered the transition |

## Allowed Actions by State

| Current State | Allowed Actions |
| --- | --- |
| `proposed` | `accept` → ready, `reject` → cancelled |
| `ready` | `start` → in_progress, `block` → blocked, `cancel` → cancelled |
| `in_progress` | `complete` → completed, `block` → blocked, `pause` → ready |
| `blocked` | `unblock` → ready, `cancel` → cancelled |

## Returns

Transition evidence record with `transitionId`, state changes, guard results, and any auto-unblocked dependents.

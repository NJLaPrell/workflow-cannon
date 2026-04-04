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
| `action` | string | yes | The transition action: `accept`, `reject`, `demote`, `start`, `block`, `cancel`, `complete`, `pause`, `unblock` |
| `actor` | string | no | Who or what triggered the transition |
| `expectedPlanningGeneration` | integer | no | When set, must match current SQLite `workspace_planning_state.planning_generation` or the command fails with **`planning-generation-mismatch`** (optimistic concurrency; see **`ADR-planning-generation-optimistic-concurrency.md`**). When **`tasks.planningGenerationPolicy`** is **`require`**, omission fails with **`planning-generation-required`** — read **`planningGeneration`** from **`list-tasks`** / **`get-next-actions`** / **`get-task`** first. |

## Allowed Actions by State

| Current State | Allowed Actions |
| --- | --- |
| `proposed` | `accept` → ready, `reject` → cancelled |
| `ready` | `demote` → proposed, `start` → in_progress, `block` → blocked, `cancel` → cancelled |
| `in_progress` | `complete` → completed, `block` → blocked, `pause` → ready |
| `blocked` | `unblock` → ready, `cancel` → cancelled |

## Returns

Success **`data`** includes transition **`evidence`**, **`autoUnblocked`**, **`planningGeneration`**, **`planningGenerationPolicy`**, and optionally **`planningGenerationPolicyWarnings`** (when policy is **`warn`** and the token was omitted). On mismatch when **`expectedPlanningGeneration`** was supplied, **`code`** is **`planning-generation-mismatch`**. When policy is **`require`** and the field was omitted, **`code`** is **`planning-generation-required`**.

## Response template (CLI shaping)

When **`action`** is **`complete`**, the kit applies the builtin **`phase_ship`** response template unless you pass **`responseTemplateId`** (or a template directive) or a config **`commandOverrides`** entry for **`run-transition`**. That adds **`data.presentation.matchedSections`** for closeout fields (e.g. **`evidence`**, **`planningGeneration`**). See **`docs/maintainers/response-template-contract.md`**.

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
| `action` | string | yes | The transition action: `accept`, `reject`, `demote`, `start`, `block`, `cancel`, `complete`, `decline`, `pause`, `unblock` |
| `actor` | string | no | Who or what triggered the transition |
| `expectedPlanningGeneration` | integer | no | When set, must match current SQLite `workspace_planning_state.planning_generation` or the command fails with **`planning-generation-mismatch`** (optimistic concurrency; see **`ADR-planning-generation-optimistic-concurrency.md`**). When **`tasks.planningGenerationPolicy`** is **`require`**, omission fails with **`planning-generation-required`** — read **`planningGeneration`** from **`list-tasks`** / **`get-next-actions`** / **`get-task`** first. |
| `clientMutationId` | string | no | Retry key. A repeated request with the same key, `taskId`, and `action` returns **`transition-idempotent-replay`** without appending duplicate evidence. Reusing the key for a different transition returns **`idempotency-key-conflict`**. |

## Allowed Actions by State

| Current State | Allowed Actions |
| --- | --- |
| `research` | `reject` → cancelled (transcript churn intake; promotion to **`improvement` / `proposed`** uses **`synthesize-transcript-churn`**, not this table) |
| `proposed` | `accept` → ready, `reject` → cancelled |
| `ready` | `demote` → proposed, `start` → in_progress, `block` → blocked, `cancel` → cancelled |
| `in_progress` | `complete` → completed, `decline` → cancelled, `block` → blocked, `pause` → ready |
| `blocked` | `unblock` → ready, `cancel` → cancelled |

## Returns

Success **`data`** includes transition **`evidence`**, **`autoUnblocked`**, **`planningGeneration`**, **`planningGenerationPolicy`**, and optionally **`planningGenerationPolicyWarnings`** (when policy is **`warn`** and the token was omitted). On mismatch when **`expectedPlanningGeneration`** was supplied, **`code`** is **`planning-generation-mismatch`**. When policy is **`require`** and the field was omitted, **`code`** is **`planning-generation-required`**.

For task-specific decisions, prefer **`get-task`** and read **`data.allowedActions`**. For global action discovery, **`workspace-kit run run-transition --schema-only`** exposes the `action` enum derived from the runtime transition map, and **`explain-task-engine-model`** exposes the lifecycle table.

## Retry safety

Use **`clientMutationId`** on agent-driven lifecycle mutations. The first successful transition records the key and a stable transition digest on the transition evidence. If CLI output is lost or JSON parsing fails, retry the same `taskId` + `action` with the same key; the command returns **`transition-idempotent-replay`**, sets **`data.replayed: true`**, and does not append another transition-log row. Replays bypass a fresh **`expectedPlanningGeneration`** requirement because the mutation already landed. If the key was used for another task/action, or the task has moved beyond the replay target state, the command returns **`idempotency-key-conflict`**.

## Delivery evidence on `complete`

When a phased execution task is completed, the `delivery-evidence` guard evaluates `task.metadata.deliveryEvidence` or `task.metadata.deliveryWaiver`.

- `tasks.deliveryEvidence.enforcementMode: "advisory"` (default) allows completion and emits a structured guard result when evidence is missing.
- `tasks.deliveryEvidence.enforcementMode: "enforce"` blocks completion when evidence or waiver metadata is missing.
- `tasks.deliveryEvidence.enforcementMode: "off"` skips this guard.

Expected `metadata.deliveryEvidence` fields:

```json
{
  "schemaVersion": 1,
  "branchName": "feature/T971-delivery-evidence-gate",
  "prUrl": "https://github.com/org/repo/pull/123",
  "prNumber": 123,
  "baseBranch": "release/phase-74",
  "mergeSha": "abc123...",
  "checks": [
    { "name": "test", "conclusion": "success" }
  ],
  "validationCommands": [
    { "command": "pnpm run test", "exitCode": 0 }
  ]
}
```

Maintainer waiver fields:

```json
{
  "schemaVersion": 1,
  "actor": "maintainer@example.com",
  "rationale": "local-only task; no PR evidence applies",
  "timestamp": "2026-04-28T07:00:00.000Z",
  "scope": "T###"
}
```

Use **`phase-delivery-preflight`** before completion to list completed or in-progress phase tasks missing this evidence. For non-shipping/local-only tasks, set `metadata.deliveryEvidenceRequired` to `false` or `metadata.localOnly` / `metadata.nonShipping` to `true`.

## Response template (CLI shaping)

When **`action`** is **`complete`**, the kit applies the builtin **`phase_ship`** response template unless you pass **`responseTemplateId`** (or a template directive) or a config **`commandOverrides`** entry for **`run-transition`**. That adds **`data.presentation.matchedSections`** for closeout fields (e.g. **`evidence`**, **`planningGeneration`**). See **`docs/maintainers/response-template-contract.md`**.

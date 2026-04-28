# run-transition

Execute a validated task status transition through the Task Engine lifecycle.

## Usage

```
workspace-kit run run-transition '{"taskId":"T184","action":"start","policyApproval":{"confirmed":true,"rationale":"validate transition"}}'
```

## Arguments

<!-- workspace-kit:generated task-engine-instruction-contract command=run-transition section=args start -->
| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `taskId` | `string` | yes | Task id. |
| `action` | string (`accept`, `block`, `cancel`, `complete`, `decline`, `demote`, `pause`, `reject`, `start`, `unblock`) | yes | Transition action. |
| `clientMutationId` | `string` | no | Retry/idempotency key. |
| `policyApproval` | `object` | no | JSON policy approval payload for sensitive run commands. |
| `expectedPlanningGeneration` | `integer` or `string` | no | Optimistic concurrency token from a prior read response. |
| `actor` | `string` | no | Actor recorded on transition evidence or task mutation metadata. |
| `config` | `object` | no | Invocation-local config override. |
<!-- workspace-kit:generated task-engine-instruction-contract command=run-transition section=args end -->

## Allowed Actions by State

<!-- workspace-kit:generated task-engine-instruction-contract command=run-transition section=actions start -->
| Current State | Allowed Actions |
| --- | --- |
| `research` | `reject` → cancelled |
| `proposed` | `accept` → ready, `reject` → cancelled |
| `ready` | `demote` → proposed, `start` → in_progress, `block` → blocked, `cancel` → cancelled |
| `in_progress` | `complete` → completed, `decline` → cancelled, `block` → blocked, `pause` → ready |
| `blocked` | `unblock` → ready, `cancel` → cancelled |
<!-- workspace-kit:generated task-engine-instruction-contract command=run-transition section=actions end -->

For transcript churn intake, promotion to **`improvement` / `proposed`** uses **`synthesize-transcript-churn`**, not this lifecycle action table.

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

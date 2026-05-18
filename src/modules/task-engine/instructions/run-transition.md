<!--
agentCapsule|v=1|command=run-transition|module=task-engine|schema_only=pnpm exec wk run run-transition --schema-only '{}'
-->

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
| `action` | string (`accept`, `await_external_decision`, `await_policy_approval`, `await_review`, `block`, `cancel`, `complete`, `decline`, `demote`, `pause`, `reject`, `resume_ready`, `resume_work`, `start`, `unblock`) | yes | Transition action. |
| `clientMutationId` | `string` | no | Retry/idempotency key. |
| `policyApproval` | `object` | no | JSON policy approval payload for sensitive run commands. |
| `expectedPlanningGeneration` | `integer` or `string` | no | Optimistic concurrency token from a prior read response. |
| `actor` | `string` | no | Actor recorded on transition evidence or task mutation metadata. |
| `config` | `object` | no | Invocation-local config override. |
<!-- workspace-kit:generated task-engine-instruction-contract command=run-transition section=args end -->

Set **`waitForLease:true`** only when the caller is prepared to wait for a workspace edit lease before mutating task state. The wait is bounded and low-frequency; timeout responses include the current holder summary in **`data.holder`** / **`data.leaseStatus`**. Normal `run-transition` behavior is unchanged when the field is omitted.

**Intake guard (proposed → ready):** before **`accept`**, use **`workspace-kit run resolve-task-intake-policy`** with `taskId`, `action":"accept"`, and `targetStatus":"ready"` to see required gaps — enforcement follows **`tasks.intakePolicy`** (including **`enforce-on-accept`**).

## Phase notes (optional)

When kit SQLite **`user_version` ≥ 19** (phase journal DDL present), **`phaseNotes`** may be set to an array of objects validated like **`add-phase-note`** (same field names except **`phaseKey`** is taken from the transition task’s **`phaseKey`** / **`phase`** label), including the **built-in secret-shaped pattern guard** (`**phase-note-secret-rejected**` on pasted credential shapes). Each note defaults **`taskId`** to the transition task; a different **`taskId`** is allowed only when that task resolves to the same phase.

Notes are written in the **same SQLite transaction** as the transition persistence: if validation fails, no transition side effects occur; if the transition persist fails, notes are not committed separately.

Omit **`phaseNotes`** entirely for behavior identical to releases before this feature. At most **`20`** notes per request.

## Allowed Actions by State

<!-- workspace-kit:generated task-engine-instruction-contract command=run-transition section=actions start -->
| Current State | Allowed Actions |
| --- | --- |
| `research` | `reject` → cancelled |
| `proposed` | `accept` → ready, `reject` → cancelled |
| `ready` | `demote` → proposed, `start` → in_progress, `block` → blocked, `cancel` → cancelled, `await_review` → awaiting_review, `await_policy_approval` → awaiting_policy_approval, `await_external_decision` → awaiting_external_decision |
| `in_progress` | `complete` → completed, `decline` → cancelled, `block` → blocked, `pause` → ready, `await_review` → awaiting_review, `await_policy_approval` → awaiting_policy_approval, `await_external_decision` → awaiting_external_decision |
| `awaiting_review` | `resume_ready` → ready, `resume_work` → in_progress, `block` → blocked, `cancel` → cancelled |
| `awaiting_policy_approval` | `resume_ready` → ready, `resume_work` → in_progress, `block` → blocked, `cancel` → cancelled |
| `awaiting_external_decision` | `resume_ready` → ready, `resume_work` → in_progress, `block` → blocked, `cancel` → cancelled |
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

- `tasks.deliveryEvidence.enforcementMode: "enforce"` (default) blocks completion when evidence or waiver metadata is missing.
- `tasks.deliveryEvidence.enforcementMode: "advisory"` allows completion and emits a structured guard result when evidence is missing.
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

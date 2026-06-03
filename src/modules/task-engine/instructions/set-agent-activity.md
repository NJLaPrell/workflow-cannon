<!--
agentCapsule|v=1|command=set-agent-activity|module=task-engine|schema_only=pnpm exec wk run set-agent-activity --schema-only '{}'
-->

# set-agent-activity

Set a short-lived live dashboard status lease. This is for high-signal workflow boundaries only; do not call it from read-only polling commands.

Use this command when the agent enters a new visible boundary, not as a generic progress ping. If the work stays in the same boundary, refresh it with `heartbeat-agent-activity-lease` instead of rewriting the label every few seconds.

## Usage

```
workspace-kit run set-agent-activity '{"kind":"working_task","taskId":"T400","command":"run-transition"}'
```

Rich example payload:

```bash
workspace-kit run set-agent-activity '{
  "activityId":"copilot:session-1",
  "agentId":"copilot",
  "sessionId":"session-1",
  "agentDefinitionId":"task-worker",
  "assignmentId":"assign_823",
  "kind":"reviewing_pr",
  "label":"Reviewing Pull Request 192",
  "taskId":"T100671",
  "phaseKey":"129",
  "prNumber":192,
  "command":"review-item",
  "currentStep":"Review diff and leave summary",
  "hostHint":"cursor-drawer",
  "modelTier":"high_reasoning",
  "modelHint":"PR review",
  "details":{
    "prUrl":"https://github.com/NJLaPrell/workflow-cannon/pull/192",
    "pullRequestUrl":"https://github.com/NJLaPrell/workflow-cannon/pull/192",
    "reviewItemId":"review-item-192",
    "detail":"checking docs-only guidance before handoff",
    "nextStep":"post review summary"
  },
  "ttlSeconds":90
}'
```

Common kinds: `planning`, `working_task`, `blocked`, `validating`, `reviewing_item`, `reviewing_pr`, `releasing`, `awaiting_policy_approval`, and `awaiting_human_gate`.

Optional fields: `label`, `agentId`, `sessionId`, `activityId`, `agentDefinitionId`, `assignmentId`, `currentStep`, `hostHint`, `modelTier`, `modelHint`, `taskId`, `command`, `phaseKey`, `prNumber`, `version`, `details`, and `ttlSeconds`. If `label` is omitted, workspace-kit generates a short label from structured fields. TTL defaults to **90 seconds** and is clamped between 30 seconds and 1 hour. Activity v1 argv is validated against agent-activity.v1 on write; response includes `activityV1` and read-path lifecycle per A-ACTIVITY (fresh for the first 30 seconds after update, aging from 30 to 60 seconds, stale after 60 seconds, expired at `expiresAt`).

## When to use it

- Start a boundary: emit a fresh activity when work begins, such as `planning`, `working_task`, `reviewing_pr`, `validating`, or `releasing`.
- Change a boundary: emit a new activity when the visible mode changes, such as `working_task` to `blocked`, `working_task` to `validating`, or `validating` to `releasing`.
- Keep the same boundary alive: use `heartbeat-agent-activity-lease` when the kind and label are still correct and you only need to refresh freshness.
- Do not use heartbeat to relabel work. If the meaning changed, call `set-agent-activity` again.

## Useful `details` keys

These keys are treated as meaningful by the dashboard label/readback path today:

- `details.prUrl` or `details.pullRequestUrl` - lets PR review activity render a useful PR label without a network lookup.
- `details.prNumber`, `details.pullRequestNumber`, or `details.pr_number` - alternate PR number inputs when the top-level `prNumber` field is not present.
- `details.reviewItemId`, `details.approvalItemId`, `details.itemId`, `details.approvalId`, or `details.taskId` - identifies the reviewed item for `reviewing_item` and approval-gate work.
- `details.validationLabel`, `details.validationCommand`, or `details.checkName` - drives the label for validation activity.
- `details.releaseVersion`, `details.version`, or `details.buildVersion` - gives release activity a build-oriented label.
- `details.phaseKey` or `details.phase` - falls back into release labeling when the version is not available.
- `details.detail` - appears in dashboard status readback as the concise detail string.
- Any other structured context you need for the operator can live in `details`, but these keys have the clearest dashboard impact.

Structured label conventions:

- PR review: pass `prNumber` when known, or `details.prUrl` / `details.pullRequestUrl` so the label can become `Reviewing Pull Request 192` without a GitHub network call.
- Release: pass `version` for `Releasing Build 0.9.1`; otherwise pass `phaseKey` for `Releasing Phase 81`.
- Approval review and gates: pass `taskId`, `details.reviewItemId`, `details.approvalItemId`, or `details.itemId` to identify the reviewed item without changing task lifecycle state.
- Validation: pass `details.validationLabel`, `details.validationCommand`, or `command` for labels like `Validating pnpm run test`.
- Blocking: pair `kind: "blocked"` with `taskId` plus a short `details.detail` or `details.reason` so the dashboard can show why the task is paused.

Failures are explicit for this command. Callers that are recording activity as a side effect should treat failures as best-effort and continue the underlying workflow.

# Agent orchestration activity runbook

**Artifact:** A-ACTIVITY-OPS
**Use when:** Writing or reviewing agent activity lifecycle examples for Workflow Cannon orchestration.

This runbook is the operational companion to [AGENT_ORCHESTRATION_ACTIVITY.md](../../AGENT_ORCHESTRATION_ACTIVITY.md). It keeps the live activity lease surface separate from assignment, handoff, and task lifecycle state.

## What this covers

- `set-agent-activity` and `heartbeat-agent-activity-lease`
- `clear-agent-activity`
- TTL freshness, stale visibility, and expiry behavior
- Dashboard readback via `dashboard-summary`
- The handoff boundary between live activity and assignment state

## Core rules

- Activity is a short-lived lease, not a task status.
- One agent can have one current visible activity lease per session unless the product explicitly adds a multi-lease view.
- Live activity may override derived status for dashboard display, but it must not replace assignment or handoff evidence.
- Stale leases remain visible until expiry, but they should read as low-confidence.
- `set-agent-activity` marks the start of a new visible boundary; `heartbeat-agent-activity-lease` only refreshes the same boundary.
- Use a new activity when the operator-visible mode changes: planning, working, blocked, validating, reviewing, releasing, or awaiting approval/human gate.
- Refresh the current boundary before it goes stale. Default TTL is 90 seconds; fresh is the first 30 seconds after update, aging is 30 to 60 seconds, stale starts after 60 seconds, and the lease expires at `expiresAt`.

## Copyable command examples

```bash
pnpm exec wk run set-agent-activity '{"activityId":"copilot:session-1","agentId":"copilot","sessionId":"session-1","kind":"working_task","label":"Working on Task T100650","taskId":"T100650","phaseKey":"128","command":"run-transition","details":{"taskId":"T100650","detail":"implementing task lifecycle transition","nextStep":"finish validation"},"now":"2026-06-02T17:00:00.000Z","expiresAt":"2026-06-02T17:05:00.000Z","policyApproval":{"confirmed":true,"rationale":"record agent activity lease"}}'
```

```bash
pnpm exec wk run heartbeat-agent-activity-lease '{"activityId":"copilot:session-1","now":"2026-06-02T17:01:00.000Z","expiresAt":"2026-06-02T17:06:00.000Z","policyApproval":{"confirmed":true,"rationale":"refresh the current activity boundary"}}'
```

```bash
pnpm exec wk run clear-agent-activity '{"agentId":"copilot","sessionId":"session-1","policyApproval":{"confirmed":true,"rationale":"clear activity lease after handoff"}}'
```

## Useful `details` keys

- `details.prUrl` / `details.pullRequestUrl` - best for `reviewing_pr`.
- `details.reviewItemId`, `details.approvalItemId`, `details.itemId`, `details.approvalId`, `details.taskId` - best for `reviewing_item`, `awaiting_policy_approval`, or a gate tied to a specific task.
- `details.validationLabel`, `details.validationCommand`, `details.checkName` - best for `validating`.
- `details.releaseVersion`, `details.version`, `details.buildVersion` - best for `releasing`.
- `details.phaseKey` / `details.phase` - useful when release work is phase-scoped.
- `details.detail` - operator-facing concise explanation that also appears in dashboard readback.

## Expected cadence

- Emit `set-agent-activity` when you cross from one visible boundary to another.
- Heartbeat the same `activityId` while the boundary is still true and you want the dashboard to stay fresh.
- Do not rely on heartbeat to change labels, kinds, or target objects.
- Prefer a heartbeat cadence that keeps the lease comfortably inside the fresh window, especially during long review or validation sessions.

## Suggested verification

- Confirm `dashboard-summary` shows the live lease in `agentStatus` and `agentActivitySummary`.
- Confirm the lease disappears after clear or expiry.
- Confirm stale visibility does not masquerade as fresh work.

## Operator sign-off

- [ ] Examples match the current command schema.
- [ ] Lifecycle language matches the activity lease contract.
- [ ] Dashboard readback is covered.

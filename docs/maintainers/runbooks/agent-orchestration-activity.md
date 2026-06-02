<!-- GENERATED FROM .ai/runbooks/agent-orchestration-activity.md — edit that file; do not hand-edit this render (see docs/maintainers/adrs/ADR-ai-canonical-maintainer-docs-pipeline.md) -->

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

## Copyable command examples

```bash
pnpm exec wk run set-agent-activity '{"activityId":"copilot:session-1","agentId":"copilot","sessionId":"session-1","kind":"working_task","label":"Working on Task T100650","taskId":"T100650","phaseKey":"128","now":"2026-06-02T17:00:00.000Z","expiresAt":"2026-06-02T17:05:00.000Z","policyApproval":{"confirmed":true,"rationale":"record agent activity lease"}}'
```

```bash
pnpm exec wk run heartbeat-agent-activity-lease '{"activityId":"copilot:session-1","now":"2026-06-02T17:01:00.000Z","expiresAt":"2026-06-02T17:06:00.000Z","policyApproval":{"confirmed":true,"rationale":"refresh the activity lease"}}'
```

```bash
pnpm exec wk run clear-agent-activity '{"agentId":"copilot","sessionId":"session-1","policyApproval":{"confirmed":true,"rationale":"clear activity lease after handoff"}}'
```

## Suggested verification

- Confirm `dashboard-summary` shows the live lease in `agentStatus` and `agentActivitySummary`.
- Confirm the lease disappears after clear or expiry.
- Confirm stale visibility does not masquerade as fresh work.

## Operator sign-off

- [ ] Examples match the current command schema.
- [ ] Lifecycle language matches the activity lease contract.
- [ ] Dashboard readback is covered.

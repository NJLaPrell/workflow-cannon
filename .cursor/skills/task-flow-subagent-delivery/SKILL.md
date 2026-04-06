---
name: task-flow-subagent-delivery
description: Optional Cursor skill — load when delivering one T### via release/phase branch, run-transition, and JSON policyApproval. Links machine canon only.
---

# Task-flow subagent delivery

## When to use

Single-task maintainer delivery: branch from **`release/phase-<N>`**, implement, PR into the phase branch, merge, **`run-transition` `complete`**.

## Do this

1. Follow **`.ai/playbooks/task-to-phase-branch.md`** step order (start before first implementation commit).
2. Use **`pnpm run wk run …`** with JSON args; sensitive commands need **`policyApproval`** in the third argv — see **`.ai/POLICY-APPROVAL.md`**.
3. Keep **`.ai/AGENT-CLI-MAP.md`** open for Tier A/B copy-paste.

## Do not

- Claim chat approval replaces **`policyApproval`** on **`workspace-kit run`**.
- Edit **`.workspace-kit/tasks/workspace-kit.db`** by hand for routine lifecycle.

## Cursor packaging

See **`.ai/adrs/ADR-cursor3-task-flow-subagent-packaging.md`**.

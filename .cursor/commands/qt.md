---
description: Task runtime entry command for Workflow Cannon
---

Use the task runtime to interpret `/qt` requests using repository task templates.

Primary command surface:

- `/qt`
- `/qt help`
- `/qt/[task] [input]`
- `/qt [task] [input]`
- `/qt create [task] [instructions]`
- `/qt improve [task] [input]`
- `/qt improve <accept|reject|abandon> [task] [proposal-id]`
- `/qt list`
- `/qt show [task]`
- `/qt doctor`

Behavior requirements:

1. Use task templates from `tasks/*.md`.
2. Preserve stable command/result behavior for downstream consumers.
3. Route ambiguous requests to clear next-command guidance.

## `/qt` vs `workspace-kit`

`/qt` is **prompt scaffolding** only: it does not execute `workspace-kit`, does not write task-engine state, and **does not satisfy** JSON **`policyApproval`** (or env approval) for sensitive **`workspace-kit run`** commands—chat-only “approved” text is not enough. When a template would persist task status, policy-gated work, or other kit-owned mutations, the operator must run the exact **`workspace-kit run ...`** line from **`docs/maintainers/AGENT-CLI-MAP.md`** in a real shell (or label the step **planning-only**). See **`docs/maintainers/POLICY-APPROVAL.md`** for the two-lane model.


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

`/qt` is **prompt scaffolding** only: it does not execute `workspace-kit` or write task-engine state. When a template would “save” task status, policy-gated work, or kit-owned mutations, the same step must name the **`workspace-kit run ...`** line (or label the step **planning-only**). See **`docs/maintainers/AGENT-CLI-MAP.md`**.


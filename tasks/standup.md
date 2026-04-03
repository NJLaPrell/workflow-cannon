---
templateVersion: 1
taskName: standup
---

> **Not `workspace-kit`:** This file is a **prompt-only** maintainer template. It does not run the CLI, write task-engine state, or satisfy JSON **`policyApproval`**. To mutate kit-owned state, run the matching line from **`docs/maintainers/AGENT-CLI-MAP.md`** in a terminal.

# standup

- Goal: Summarize yesterday/today/blockers in concise bullets.
- Use the provided user input.
- Return a concise result.

**Persist via CLI:** Planning only — no task-engine or policy-gated `workspace-kit` persistence for this template.

---
**Use:** Open or @-attach `tasks/standup.md` with standup notes.
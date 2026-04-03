---
templateVersion: 1
taskName: release-notes
---

> **Not `workspace-kit`:** This file is a **prompt-only** maintainer template. It does not run the CLI, write task-engine state, or satisfy JSON **`policyApproval`**. To mutate kit-owned state, run the matching line from **`docs/maintainers/AGENT-CLI-MAP.md`** in a terminal.

# release-notes

- Goal: Draft user-facing release notes from merged changes.
- Use the provided user input.
- Return a concise result.

**Persist via CLI:** Planning only — no task-engine or policy-gated `workspace-kit` persistence for this template.

---
**Use:** Open or @-attach `tasks/release-notes.md` with release context.
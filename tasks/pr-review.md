---
quicktaskVersion: 1
taskName: pr-review
---

> **`/qt` is not `workspace-kit`:** This template is editor-only. It never satisfies JSON **`policyApproval`**. To change task-engine or other kit-owned state, run the matching line from **`docs/maintainers/AGENT-CLI-MAP.md`** in a terminal.

# pr-review

- Goal: Review pull requests for risks, regressions, and missing tests.
- Use the provided user input.
- Return a concise result.

**Persist via CLI:** Planning only — no task-engine or policy-gated `workspace-kit` persistence for this template.

---
Run (example): `/qt/pr-review your input here`
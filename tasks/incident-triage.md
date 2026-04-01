---
quicktaskVersion: 1
taskName: incident-triage
---

> **`/qt` is not `workspace-kit`:** This template is editor-only. It never satisfies JSON **`policyApproval`**. To change task-engine or other kit-owned state, run the matching line from **`docs/maintainers/AGENT-CLI-MAP.md`** in a terminal.

# incident-triage

- Goal: Collect incident facts, impact, owner, and next action.
- Use the provided user input.
- Return a concise result.

**Persist via CLI:** Planning only — no task-engine or policy-gated `workspace-kit` persistence for this template.

---
Run (example): `/qt/incident-triage your input here`
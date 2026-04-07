---
description: Improvement triage — promote ≤3 proposed improvement tasks to ready (accept + policyApproval)
---

The user invoked **process-proposed-improvements**. Follow **`docs/maintainers/playbooks/improvement-triage-top-three.md`** (id **`improvement-triage-top-three`**). Optional: **`.cursor/rules/playbook-improvement-triage-top-three.mdc`**.

1. List proposed improvements with `workspace-kit run list-tasks '{"status":"proposed","type":"improvement"}'`; pick **at most three** per the playbook rubric; promote with Tier A **`run-transition`** **`accept`** and JSON **`policyApproval`** per **`docs/maintainers/AGENT-CLI-MAP.md`**.
2. Do not hand-edit kit-owned stores for lifecycle transitions.

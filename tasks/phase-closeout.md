---
quicktaskVersion: 1
taskName: phase-closeout
---
# phase-closeout

## 1) Load the playbook

Open and follow the ordered checklist in **`docs/maintainers/playbooks/phase-closeout-and-release.md`** (playbook id `phase-closeout-and-release`). Attach that file in chat (`@`) so the agent has full context.

Authoring rules and index: `docs/maintainers/playbooks/README.md`. Discovery table: `docs/maintainers/AGENTS.md` → **Maintainer playbooks**.

## 2) User input

Use the provided user input for phase name, version target, or special constraints.

## 3) Persist via CLI (task-engine)

If this workflow changes task lifecycle, use Tier A **`run-transition`** with JSON **`policyApproval`** on the **third** argument — not chat-only approval. Copy-paste shapes from **`docs/maintainers/AGENT-CLI-MAP.md`** (see also `src/modules/task-engine/instructions/run-transition.md`).

**Start work on a task:**

```bash
workspace-kit run run-transition '{"taskId":"T###","action":"start","policyApproval":{"confirmed":true,"rationale":"begin phase-closeout work"}}'
```

**Mark complete:**

```bash
workspace-kit run run-transition '{"taskId":"T###","action":"complete","policyApproval":{"confirmed":true,"rationale":"acceptance criteria met"}}'
```

Replace `T###` and rationale strings per task. Do **not** hand-edit `.workspace-kit/tasks/state.json` for routine lifecycle moves.

---
Run (example): `/qt/phase-closeout Phase 25 → v0.26.0`

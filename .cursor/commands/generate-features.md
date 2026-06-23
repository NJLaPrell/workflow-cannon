---
description: Ideas → planner-chat — turn ranked ideas into PlanArtifacts and execution tasks
---

The user invoked **generate-features** (Generate Features). Follow **`.ai/playbooks/planner-chat.md`** (id **`planner-chat`**).

1. Start from open Ideas rows via **`pnpm exec wk run list-ideas '{}'`** (or the idea id the operator names). Load context with **`get-idea`** when needed.
2. Guide the operator through planner-chat: draft PlanArtifact, review, accept, and phase/task creation per the playbook — persist only via **`workspace-kit run`**.
3. Use **`.ai/AGENT-CLI-MAP.md`** and **`.ai/POLICY-APPROVAL.md`** for tiers and JSON **`policyApproval`** / **`expectedPlanningGeneration`** when policy requires it.
4. Do not hand-edit kit-owned stores for lifecycle or planning persistence.

Maintainer-rendered mirror (not the agent bootstrap path): `docs/maintainers/playbooks/planner-chat.md`.

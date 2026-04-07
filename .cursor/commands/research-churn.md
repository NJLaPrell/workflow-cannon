---
description: Transcript churn (research) → synthesize to proposed improvement
---

The user invoked **research-churn**. Follow **`.ai/playbooks/transcript-churn-research.md`** (id **`transcript-churn-research`**).

1. List **`transcript_churn` / `research`** tasks; investigate evidence; run **`synthesize-transcript-churn`** with a real **`synthesis`** body per **`src/modules/task-engine/instructions/synthesize-transcript-churn.md`**. Use **`.ai/AGENT-CLI-MAP.md`** for **`policyApproval`** and **`expectedPlanningGeneration`** when required.
2. To drop a row: **`run-transition`** **`reject`** from **`research`** → **`cancelled`**.
3. Do not hand-edit kit stores for promotion.

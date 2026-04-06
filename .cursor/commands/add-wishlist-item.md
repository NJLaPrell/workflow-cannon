---
description: Create a wishlist intake task (create-wishlist)
---

The user invoked **`/add-wishlist-item`**. Goal: create a **`wishlist_intake`** row via **`workspace-kit run create-wishlist`**.

1. Gather these **required** string fields if the user has not already provided them (all non-empty): **`title`**, **`problemStatement`**, **`expectedOutcome`**, **`impact`**, **`constraints`**, **`successSignals`**, **`requestor`**, **`evidenceRef`**. Do **not** set **`phase`** on wishlist intake.

2. If effective config may use **`tasks.planningGenerationPolicy: require`**, run **`pnpm run wk run get-next-actions '{}'`** or **`pnpm run wk run dashboard-summary '{}'`** first, read **`planningGeneration`** from the JSON, and include **`"expectedPlanningGeneration": <that number>`** in the **`create-wishlist`** payload.

3. Run from repo root:

   `pnpm run wk run create-wishlist '<json>'`

4. On success, report **`taskId`** and the created wishlist **`id`** / wire shape from **`data`**. On failure, surface **`code`**, **`message`**, and **`remediation.instructionPath`** if present.

Canonical field rules: **`src/modules/task-engine/instructions/create-wishlist.md`**.

**Optional:** The Workflow Cannon dashboard toolbar has an **Add wishlist item** button that walks the same fields in the editor and calls **`create-wishlist`** for you.

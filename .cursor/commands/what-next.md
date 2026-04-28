---
description: Read-only next actions from the task engine (get-next-actions)
---

The user invoked **`/what-next`**. From the repository root, run:

`pnpm exec wk run get-next-actions '{}'`

(alternatively `pnpm exec wk run get-next-actions '{}'` when `wk` is not on `PATH`).

Parse the **single JSON object** on stdout. Summarize **`nextActions`**, ready-queue hints, blockers, and anything else actionable. This command is **read-only** — do not call **`run-transition`** or other mutating **`wk run`** commands unless the user explicitly asks to change state.

If the workspace uses **`tasks.planningGenerationPolicy: require`**, treat **`planningGeneration`** in the response as the token to carry into **later** mutating calls only; **`get-next-actions`** itself needs no concurrency fields.

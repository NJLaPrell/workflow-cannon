---
description: List tasks from the task engine (read-only)
---

The user invoked **`/list-tasks`**. From the repository root, run:

`pnpm run wk run list-tasks '{}'`

Parse the JSON stdout and give a compact summary: counts by status, ready vs proposed, wishlist intake vs execution work where the payload distinguishes them, and notable **`T###`** ids. **Read-only** — no lifecycle transitions unless the user explicitly asks to mutate state.

Optional filters: if the user names a status or task id, re-run with the appropriate JSON args per **`src/modules/task-engine/instructions/list-tasks.md`** when those shapes exist.

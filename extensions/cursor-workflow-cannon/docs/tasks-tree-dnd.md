# Tasks tree drag-and-drop (extension)

Operator matrix for the **Tasks** sidebar (`workflowCannon.tasks`). Implementation: `TasksTreeDragController.ts` + pure helpers in `task-tree-dnd.ts`.

## Draggable sources

- **In scope:** Tree rows with `kind: "task"` where `id` matches `^T\d+$` and the row is **not** wishlist intake (`type !== "wishlist_intake"` and not legacy wishlist metadata).
- **Out of scope:** Wishlist rows, phase folders, status headers, proposed improvements with `imp-*` ids (extension limits DnD to canonical `T###` execution tasks).

## Drop targets and CLI mapping

| Target | Meaning | Command | JSON args (minimal) |
| --- | --- | --- | --- |
| Phase folder (`phase-bucket`, `phaseKey` set) | Assign maintainer phase bucket | `assign-task-phase` | `taskId`, `phaseKey` |
| Phase folder “Not Phased” (`phaseKey: null`) | Clear phase fields | `clear-task-phase` | `taskId` |
| Status group (`group`, e.g. Ready, In progress) | Lifecycle move to that status | `run-transition` | `taskId`, `action`, `policyApproval` |

`run-transition` **actions** are derived from the current task status and the **target group’s** `status` field, using the same edge table as task-engine `ALLOWED_TRANSITIONS` (see `task-tree-dnd.ts`). If there is no allowed edge, the drop is rejected with a VS Code warning.

## Disallowed / rejected drops

- Drop on **completed** or **cancelled** phase buckets for phase mutations (no `assign-task-phase` / `clear-task-phase`).
- Drop on wishlist or non-task nodes.
- Invalid lifecycle pairs (no matching transition).
- **Policy:** `run-transition` always prompts for confirmation and a **policy rationale** (JSON `policyApproval`) before invoking the CLI. `assign-task-phase` / `clear-task-phase` are non-sensitive in the kit manifest; the extension still uses a modal confirm.

## Refresh and truth

After a successful mutating CLI call, the extension fires the same kit refresh signal as other commands so the tree reloads from `list-tasks` / `dashboard-summary`.

## Tests

Pure logic is covered in `extensions/cursor-workflow-cannon/test/task-tree-dnd.test.mjs` (requires `pnpm run compile` in the extension package first).

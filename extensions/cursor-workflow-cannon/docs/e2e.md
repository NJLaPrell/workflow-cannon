# Workflow Cannon extension E2E checklist

## Prerequisites

1. From repo root run:
   - `pnpm run build`
   - `cd extensions/cursor-workflow-cannon && npm install && npm run compile`
2. Open the repository in Cursor/VS Code.
3. Launch **Extension Development Host** for `extensions/cursor-workflow-cannon`.

## Checklist

- [ ] **Dashboard loads**: open the Workflow Cannon activity bar and confirm Dashboard renders state summary from `workspace-kit run dashboard-summary`.
- [ ] **Dashboard refresh works**: run `Workflow Cannon: Refresh Dashboard`; UI updates without errors.
- [ ] **Ready queue command works**: run `Workflow Cannon: Show Ready Queue`; quick pick opens.
- [ ] **Task action works**: run `Workflow Cannon: Task Action`, pick a task, apply an allowed transition, and confirm success feedback.
- [ ] **Direct task commands work**: run `Workflow Cannon: Start Task`, `Complete Task`, `Block Task`, `Pause Task`, `Unblock Task` on applicable tasks.
- [ ] **Config validation works**: run `Workflow Cannon: Validate Config` and confirm successful output.
- [ ] **State watcher refreshes**: after a task transition, Tasks tree refreshes without reloading the window.
- [ ] **Policy-denied UX**: trigger a sensitive command without required approval and confirm an explicit error is shown (no silent mutation).

## Expected success signals

- Dashboard shows phase/status counts and suggested task.
- Task transitions show success or explicit denial/error text.
- No direct edits to `.workspace-kit/tasks/state.json` or `.workspace-kit/config.json` from extension code paths.

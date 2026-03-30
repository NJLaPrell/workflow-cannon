# Workflow Cannon extension E2E checklist

## Automated checks (no IDE required)

From `extensions/cursor-workflow-cannon`:

```bash
npm install && npm test
```

Includes **dashboard HTML rendering** tests (`render-dashboard.ts` + fixture) so regressions show up in CI-style runs before you F5.

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
- [ ] **Wishlist in Tasks tree**: when open wishlist items exist, **Tasks** shows **Wishlist — open (n)**; click an item and confirm **Show Wishlist Detail** markdown preview.
- [ ] **Wishlist watcher**: after creating/updating a wishlist item (JSON store), Tasks tree refreshes (same debounce as tasks).
- [ ] **Policy-denied UX**: trigger a sensitive command without required approval and confirm an explicit error is shown (no silent mutation).

## Expected success signals

- Dashboard shows phase/status counts and suggested task.
- Task transitions show success or explicit denial/error text.
- No direct edits to `.workspace-kit/tasks/state.json` or `.workspace-kit/config.json` from extension code paths.

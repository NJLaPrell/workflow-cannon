# Workflow Cannon extension E2E checklist

## Automated checks (no IDE required)

From repository root (workspace install — do not use `npm install` in the extension folder):

```bash
pnpm install
pnpm run build
pnpm --filter cursor-workflow-cannon test
```

Includes **dashboard HTML rendering** tests (`render-dashboard.ts` + fixture) so regressions show up in CI-style runs before you F5.

**Important:** those tests run the **HTML renderer in Node only**. They do **not** open Cursor’s webview. A blank sidebar panel is a **host/webview** issue; use the steps below.

### If the Dashboard looks blank

1. **Output log (extension host)** — **View → Output**, then choose **“Workflow Cannon”** in the output dropdown. You should see lines like `[dashboard] resolveWebviewView` and `[dashboard] pushUpdate: ok=…`. If `pushUpdate` never runs, the view did not mount; if `htmlBytes≈0`, rendering failed.
2. **Webview devtools (renderer)** — Click the **Dashboard** panel so it’s focused. **Command Palette** (`Cmd+Shift+P` / `Ctrl+Shift+P`):
   - **`Developer: Open Webview Developer Tools`** — opens DevTools for the **active webview** (best for sidebar webviews).
   - If that command is missing, try **`Developer: Toggle Developer Tools`** — main window DevTools (you may need to find the webview iframe in the Elements tree).
3. Confirm **`pnpm run build`** at the repo root so `dist/cli.js` exists; the extension shells out to it for `dashboard-summary`.

## Prerequisites

1. From repo root run:
   - `pnpm install`
   - `pnpm run build`
   - `pnpm run ext:compile` (or `pnpm --filter cursor-workflow-cannon run compile`)
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

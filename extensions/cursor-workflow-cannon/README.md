# Workflow Cannon — Cursor / VS Code extension

Thin UI over `workspace-kit`: **no direct edits** to `.workspace-kit/tasks/state.json` or config files.

## Dev setup

From repository root:

```bash
pnpm install
pnpm run ui:prepare
```

One-key launch in Cursor/VS Code:

- Press `F5` on the `Extension: Workflow Cannon` launch config.
- The pre-launch task `workflow-cannon: prepare-ui` now runs automatically.

In Cursor/VS Code: **Run → Open Folder** on the `workflow-cannon` repo, then **Run Extension Development Host** (open `extensions/cursor-workflow-cannon` as a folder and launch, or attach debugger using a launch config that points at this package).

F5 typical `launch.json` (workspace root):

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Extension: Workflow Cannon",
      "type": "extensionHost",
      "request": "launch",
      "args": ["--extensionDevelopmentPath=${workspaceFolder}/extensions/cursor-workflow-cannon"]
    }
  ]
}
```

Open the **Workflow Cannon** activity bar to use Dashboard (webview), Tasks (tree), and Config (webview).

## CLI bridge

The extension runs `node <repo>/dist/cli.js` (or the published package path under `node_modules`). If dashboard/tasks fail with “CLI not found”, run `pnpm run build` at the repo root.

**Workspace root:** Cursor must open the folder that contains `.workspace-kit/manifest.json` (the Workflow Cannon repo root). If you open a parent directory, the extension will not attach and you get no dashboard/tasks—or you may be pointed at a different task store than you expect.

**Proposed vs ready:** The dashboard “Suggested next” and “Ready preview” rows only reflect tasks in **`ready`** status. **`proposed`** improvement work appears under **Proposed improvements** on the dashboard (after a refresh) and under the **Improvements** group in the Tasks tree. Planning appears when a `build-plan` session file exists.

## Testing

- Unit + integration tests (Node-only, no Cursor binary):

```bash
cd extensions/cursor-workflow-cannon
npm test
```

- Root build is required first because integration tests invoke real `dist/cli.js` from the repository:

```bash
pnpm run build
cd extensions/cursor-workflow-cannon
npm test
```

## Commands and operations

- `Workflow Cannon: Open Dashboard`
- `Workflow Cannon: Refresh Dashboard`
- `Workflow Cannon: Show Ready Queue`
- `Workflow Cannon: Refresh Tasks`
- `Workflow Cannon: Validate Config`
- `Workflow Cannon: Task Action`
- `Workflow Cannon: Show Task Detail`
- `Workflow Cannon: Start Task`
- `Workflow Cannon: Complete Task`
- `Workflow Cannon: Block Task`
- `Workflow Cannon: Pause Task`
- `Workflow Cannon: Unblock Task`

Manual operator checklist: `docs/e2e.md`  
Security notes: `SECURITY.md`

Dashboard contract example: `docs/fixtures/dashboard-summary.example.json`

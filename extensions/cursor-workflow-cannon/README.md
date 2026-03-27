# Workflow Cannon — Cursor / VS Code extension

Thin UI over `workspace-kit`: **no direct edits** to `.workspace-kit/tasks/state.json` or config files.

## Dev setup

From repository root:

```bash
pnpm run build
cd extensions/cursor-workflow-cannon
npm install
npm run compile
```

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

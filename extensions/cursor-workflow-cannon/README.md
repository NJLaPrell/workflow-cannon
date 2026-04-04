# Workflow Cannon — Cursor / VS Code extension

Thin UI over `workspace-kit`: **no direct edits** to the task store (default SQLite `.workspace-kit/tasks/workspace-kit.db`) or config files.

## Dev setup

From repository root (the extension is a **pnpm workspace** package — see root **`pnpm-workspace.yaml`**; there is **no** `package-lock.json` here):

```bash
pnpm install
pnpm run ui:prepare
```

**Types:** `@types/vscode` is a **root** `devDependency` so TypeScript resolves `import … from "vscode"` when you compile from the workspace. Always install from the repo root first. **`dashboard-summary`** JSON shapes are imported from **`@workflow-cannon/workspace-kit/contracts/dashboard-summary-run`** (workspace dependency — keep in sync with the kit implementation).

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

**Copy-ready mutating JSON (operators):** From a terminal at the repo root, `pnpm run wk run run-transition --schema-only` (and other pilot commands) prints **`sampleArgs`** you can paste and edit before running a real `wk run run-transition '<json>'`. Dashboard/Task transitions already inject **`expectedPlanningGeneration`** when policy is **`require`**; use the CLI helper when debugging shape errors. See **`docs/maintainers/plans/phase-52-human-cli-affordances.md`**.

**Workspace root:** Cursor must open the folder that contains `.workspace-kit/manifest.json` (the Workflow Cannon repo root). If you open a parent directory, the extension will not attach and you get no dashboard/tasks—or you may be pointed at a different task store than you expect.

**Proposed vs ready:** The dashboard “Suggested next” and “Ready preview” rows only reflect tasks in **`ready`** status. **`proposed`** improvement work appears under **Proposed improvements** on the dashboard (after a refresh) and under the **Improvements** group in the Tasks tree. Planning appears when a `build-plan` session file exists.

## Testing

- Unit + integration tests (Node-only, no Cursor binary):

```bash
pnpm run build
pnpm --filter cursor-workflow-cannon test
```

- Root **`pnpm run build`** is required first because integration tests invoke real `dist/cli.js` from the repository.

## Commands and operations

- `Workflow Cannon: Open Dashboard`
- `Workflow Cannon: Refresh Dashboard`
- `Workflow Cannon: Show Ready Queue`
- `Workflow Cannon: Refresh Tasks`
- `Workflow Cannon: Validate Config`
- `Workflow Cannon: Task Action`
- `Workflow Cannon: Show Task Detail`
- `Workflow Cannon: Show Wishlist Detail`
- `Workflow Cannon: Start Task`
- `Workflow Cannon: Complete Task`
- `Workflow Cannon: Block Task`
- `Workflow Cannon: Pause Task`
- `Workflow Cannon: Unblock Task`
- `Workflow Cannon: Prefill Chat — Wishlist Intake Playbook` (palette; optional wishlist id argument)
- `Workflow Cannon: Prefill Chat — Improvement Triage (Top Three)`
- `Workflow Cannon: Prefill Chat — Task to Phase Branch Playbook`
- **Tasks tree** — right-click an open wishlist row → **Prefill Chat — Wishlist Intake (this row)** (same prompt as Dashboard **Chat** for that id)

### Chat prefill (Cursor)

The extension seeds Cursor Composer using **`vscode.commands.executeCommand("deeplink.prompt.prefill", { text })`** (same entry Cursor uses internally). If that command is missing or fails, it tries the **`cursor://anysphere.cursor-deeplink/prompt?text=…`** URI, then copies the prompt to the clipboard with a warning. Very long prompts may hit URI length limits — trim in-session or paste from clipboard. Standard VS Code (non-Cursor) may not register the deeplink command; clipboard fallback is expected.

Dashboard **Wishlist** open rows include **Chat**; **Proposed · improvements** and **Proposed · execution** rows include **Accept** (modal **`policyApproval`** rationale + **`expectedPlanningGeneration`** when the workspace requires it) and **Chat** (improvement triage vs task-to-phase-branch playbook text). See `docs/maintainers/playbooks/wishlist-intake-to-execution.md`, `improvement-triage-top-three.md`, `task-to-phase-branch.md`.

Manual operator checklist: `docs/e2e.md`  
Security notes: `SECURITY.md`

Dashboard contract example: `docs/fixtures/dashboard-summary.example.json`

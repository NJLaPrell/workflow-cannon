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

Open the **Workflow Cannon** activity bar to use **Dashboard** (webview — task queue rollups + actions) and **Config** (webview).

**Dashboard refresh:** Besides the bottom **Refresh** button (immediate refetch), the dashboard reloads when the sidebar becomes visible again, when kit-owned files change (workspace-kit watchers), and on a **~45s** timer while the view stays open.

**Tasks tree / drag-and-drop** were removed in extension **0.1.6** — use dashboard **View** on a task row (or palette **Show Task Detail**) and **`workspace-kit run run-transition`** / **`list-tasks`** from a terminal for transitions. Proposed-row **Accept**/**Chat** on the dashboard is unchanged.

## CLI bridge

The extension runs `node <repo>/dist/cli.js` (or the published package path under `node_modules`). If dashboard/tasks fail with “CLI not found”, run `pnpm run build` at the repo root.

**Copy-ready mutating JSON (operators):** From a terminal at the repo root, `pnpm run wk run run-transition --schema-only` (and other pilot commands) prints **`sampleArgs`** you can paste and edit before running a real `wk run run-transition '<json>'`. Dashboard/Task transitions already inject **`expectedPlanningGeneration`** when policy is **`require`**; use the CLI helper when debugging shape errors. See **`docs/maintainers/plans/phase-52-human-cli-affordances.md`**.

**Approvals & policy card:** The dashboard runs **`list-approval-queue`** in parallel with **`dashboard-summary`** on each refresh so the read-only review-item queue matches **`pnpm exec wk run list-approval-queue '{}'`** for the same workspace (Tier C — no JSON **`policyApproval`**).

**Team execution & subagent cards (CLI parity):** Both rollups ship inside packaged **`dashboard-summary`** JSON. When the kit task SQLite file is available to the CLI (**`sqliteDual`** in the kit) and **`PRAGMA user_version` ≥ 7**, **`teamExecution`** is built by **`summarizeTeamAssignmentsForDashboard`** over **`kit_team_assignments`** — the same rows as **`pnpm exec wk run list-assignments '{}'`** (counts and **`topActive`** are a bounded slice / aggregate of that table). When **`user_version` ≥ 6**, **`subagentRegistry`** is built by **`summarizeSubagentsForDashboard`** over **`kit_subagent_definitions`** / **`kit_subagent_sessions`**, matching the subagent list surfaces documented in **`.ai/AGENT-CLI-MAP.md`** (team/subagent inspect). If the DB is missing or the schema is below those thresholds, both objects return **`available: false`** with zeroed counts; the dashboard should show empty cards, not stale fabrications. Mutations remain terminal **`pnpm exec wk run …`** with JSON **`policyApproval`** where required. See **`docs/maintainers/runbooks/subagent-registry.md`** for subagent depth.

**Workspace root:** Cursor must open the folder that contains `.workspace-kit/manifest.json` (the Workflow Cannon repo root). If you open a parent directory, the extension will not attach and you get no dashboard/tasks—or you may be pointed at a different task store than you expect.

**Proposed vs ready:** The dashboard “Suggested next” and ready/proposed sections only reflect tasks in the configured task store. **`proposed`** improvement work appears under **Proposed improvements** on the dashboard (after a refresh). Planning appears when a `build-plan` session file exists.

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
- `Workflow Cannon: Refresh Tasks` (refreshes the **Dashboard** webview)
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
### Chat prefill (Cursor)

**Phase closeout:** operators can invoke Cursor slash **`/complete-phase <N> [approve-release]`** — spec: **`.cursor/commands/complete-phase.md`** (publish steps require **`approve-release`** + **`.ai/RELEASING.md`** gates; **`policyApproval`** JSON still applies to **`wk run`**).

The extension seeds Cursor Composer using **`vscode.commands.executeCommand("deeplink.prompt.prefill", { text })`** (same entry Cursor uses internally). If that command is missing or fails, it tries the **`cursor://anysphere.cursor-deeplink/prompt?text=…`** URI, then copies the prompt to the clipboard with a warning. Very long prompts may hit URI length limits — trim in-session or paste from clipboard. Standard VS Code (non-Cursor) may not register the deeplink command; clipboard fallback is expected.

Dashboard **Generate Features** opens a **new** Agent/Composer chat when Cursor exposes a known **`composer.newAgentChat`** (or alias) command, then prefills the literal **`/generate-features`** string so submitting matches the slash command.

**Collaboration profiles** (quick action) prefills a chat that links **`/collaboration-profiles`**, **`/onboarding`**, **`/behavior-interview`**, and read-mostly **`pnpm exec wk run`** lines (`resolve-behavior-profile`, `list-behavior-profiles`, **`sync-effective-behavior-cursor-rule`**) — advisory only; **chat is not JSON `policyApproval`**.

Dashboard **Wishlist** open rows include **Chat**; **Proposed · improvements** and **Proposed · execution** rows include **Accept** (modal **`policyApproval`** rationale + **`expectedPlanningGeneration`** when the workspace requires it) and **Chat** (improvement triage vs task-to-phase-branch playbook text). Agent canon: **`.ai/playbooks/`** (`wishlist-intake-to-execution.md`, `improvement-triage-top-three.md`, `task-to-phase-branch.md`). Maintainer mirrors: `docs/maintainers/playbooks/`.

Manual operator checklist: `docs/e2e.md`  
Security notes: `SECURITY.md`

Dashboard contract example: `docs/fixtures/dashboard-summary.example.json`

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

Open the **Workflow Cannon** activity bar to use **Dashboard** (webview — task queue rollups + actions), **Config** (webview), **Guidance**, and the command palette action **Workflow Cannon: Open Status Dashboard** (editor-area tab — phase/drift, doctor contract, modules, CAE lines from **`dashboard-summary`** **`systemStatus`**; kit file changes trigger a debounced refresh).

**Status dashboard tab:** Opens an editor **`WebviewPanel`** fed by **`pnpm exec wk run dashboard-summary '{}'`**. Requires **`dashboard-summary`** **`data.schemaVersion` ≥ 5** ( **`systemStatus`** block). Schema **v6** adds **`systemStatus.identity`** (project / package / workspace-kit versions) and **`systemStatus.planningStore`** (SQLite path). While the tab is open, **`StateWatcher`** fires debounced refreshes (**`STATUS_PANEL_DEBOUNCE_MS`** in `StatusDashboardPanel.ts`, default **450ms**) so rapid `.workspace-kit/` edits do not spam the CLI; **Refresh now** is immediate. The merged CLI envelope may still include **`data.cae`** when CAE shadow preflight runs — that is separate from the **`caeLines`** text inside **`systemStatus`**.

**Sidebar Dashboard refresh:** Besides the bottom **Refresh** button (immediate refetch), the sidebar dashboard reloads when the view becomes visible again, when kit-owned files change (workspace-kit watchers), and on a **~45s** timer while the view stays open.

**Tasks tree / drag-and-drop** were removed in extension **0.1.6** — use dashboard **View** on a task row and **`workspace-kit run run-transition`** / **`list-tasks`** from a terminal for transitions. Proposed-row **Accept**/**Chat** on the dashboard is unchanged.

## CLI bridge

The extension runs its bundled `@workflow-cannon/workspace-kit` CLI when available, then falls back to a built repo `dist/cli.js` or the attached workspace package path. If dashboard/tasks fail with “CLI not found”, run `pnpm run build` at the repo root. Workflow Cannon expects Node 22 for its CLI/runtime. The extension prefers `workflowCannon.nodeExecutable`, `WORKSPACE_KIT_NODE`, Workflow Cannon package/runtime `.node-version` / `.nvmrc` markers through nvm, common install paths, then `node` on `PATH`; it does not automatically follow the attached project’s Node markers. When native SQLite cannot load, the extension reports the Node candidates it considered, their version/architecture, and whether the `better-sqlite3` probe failed; set `workflowCannon.nodeExecutable` or `WORKSPACE_KIT_NODE` to a Node 22 executable and rebuild with `pnpm rebuild better-sqlite3` if needed.

**Copy-ready mutating JSON (operators):** From a terminal at the repo root, `pnpm exec wk run run-transition --schema-only` (and other pilot commands) prints **`sampleArgs`** you can paste and edit before running a real `wk run run-transition '<json>'`. Dashboard/Task transitions already inject **`expectedPlanningGeneration`** when policy is **`require`**; use the CLI helper when debugging shape errors. See **`docs/maintainers/plans/phase-52-human-cli-affordances.md`**.

**Role, phase, and deliver:** The dashboard shows **Role** / **Agent temperament** and **Current phase** / **Next phase** in one card (from **`dashboard-summary`**). **Deliver** is enabled when the current phase bucket has at least one **`ready`** execution task; hover shows the count. Refresh runs **`dashboard-summary`** only.

**Team execution & subagent cards (CLI parity):** Both rollups ship inside packaged **`dashboard-summary`** JSON. When the kit task SQLite file is available to the CLI (**`sqliteDual`** in the kit) and **`PRAGMA user_version` ≥ 7**, **`teamExecution`** is built by **`summarizeTeamAssignmentsForDashboard`** over **`kit_team_assignments`** — the same rows as **`pnpm exec wk run list-assignments '{}'`** (counts and **`topActive`** are a bounded slice / aggregate of that table). When **`user_version` ≥ 6**, **`subagentRegistry`** is built by **`summarizeSubagentsForDashboard`** over **`kit_subagent_definitions`** / **`kit_subagent_sessions`**, matching the subagent list surfaces documented in **`.ai/AGENT-CLI-MAP.md`** (team/subagent inspect). If the DB is missing or the schema is below those thresholds, both objects return **`available: false`** with zeroed counts; the dashboard should show empty cards, not stale fabrications. Mutations remain terminal **`pnpm exec wk run …`** with JSON **`policyApproval`** where required. See **`docs/maintainers/runbooks/subagent-registry.md`** for subagent depth.

**Workspace root:** Cursor must open the folder that contains `.workspace-kit/manifest.json` (the Workflow Cannon repo root). If you open a parent directory, the extension will not attach and you get no dashboard/tasks—or you may be pointed at a different task store than you expect.

**Proposed vs ready:** The dashboard “Suggested next” and ready/proposed sections only reflect tasks in the configured task store. **`proposed`** improvement work appears under **Proposed improvements** on the dashboard (after a refresh). When **`dashboard-summary`** returns **`phaseBuckets`** with **`taskIds`**, each phase heading can show **Accept All** (one shared policy rationale; the extension refreshes the planning-generation token between each **`run-transition`** **`accept`**). Planning appears when a `build-plan` session file exists.

## Testing

- Unit + integration tests (Node-only, no Cursor binary):

```bash
pnpm run build
pnpm --filter cursor-workflow-cannon test
```

- Root **`pnpm run build`** is required first because integration tests invoke real `dist/cli.js` from the repository.

**Manual check (wishlist add):** Dashboard **Add wishlist item** should end with a clear toast (title + id) and an **Open wishlist detail** action; closing any prompt without saving should say the flow was cancelled.

## Commands and operations

- `Workflow Cannon: Open Dashboard`
- `Workflow Cannon: Open Status Dashboard`
- `Workflow Cannon: Show Ready Queue`
- `Workflow Cannon: Prefill Chat — Wishlist Intake Playbook` (palette; optional wishlist id argument)
- `Workflow Cannon: Generate Features`
### Chat prefill (Cursor)

User-facing Cursor slash commands live under **`.cursor/commands/`**: **`/add-wishlist-item`**, **`/generate-features`**, **`/list-tasks`**, **`/what-next`**, **`/onboarding`**, and **`/behavior-interview`**.

The extension seeds Cursor Composer using **`vscode.commands.executeCommand("deeplink.prompt.prefill", { text })`** (same entry Cursor uses internally). In Standard VS Code, it uses detected command capabilities to prefer the native chat prefill command. The **`cursor://anysphere.cursor-deeplink/prompt?text=…`** URI fallback is only attempted when the editor URI scheme is **`cursor`**; otherwise the prompt is copied to the clipboard with a warning. The dashboard shows the detected editor integration state (editor, URI scheme, and chat prefill route). Very long prompts may hit URI length limits — trim in-session or paste from clipboard.

Dashboard and palette **Generate Features** open a **new** Agent/Composer chat when Cursor exposes a known **`composer.newAgentChat`** (or alias) command, then prefill the literal **`/generate-features`** string so submitting matches the slash command.

**Collaboration profiles** (quick action) prefills a chat that links **`/onboarding`**, **`/behavior-interview`**, and read-mostly **`pnpm exec wk run`** lines (`resolve-behavior-profile`, `list-behavior-profiles`, **`sync-effective-behavior-cursor-rule`**) — advisory only; **chat is not JSON `policyApproval`**.

Dashboard **Wishlist** open rows include **Chat**; **Proposed · improvements** and **Proposed · execution** rows include **Accept** (modal **`policyApproval`** rationale + **`expectedPlanningGeneration`** when the workspace requires it) and **Chat** (improvement triage vs task-to-phase-branch playbook text). Agent canon: **`.ai/playbooks/`** (`wishlist-intake-to-execution.md`, `improvement-triage-top-three.md`, `task-to-phase-branch.md`). Maintainer mirrors: `docs/maintainers/playbooks/`.

Manual operator checklist: `docs/e2e.md`  
Security notes: `SECURITY.md`

Dashboard contract example: `docs/fixtures/dashboard-summary.example.json`

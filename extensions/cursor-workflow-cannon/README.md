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

Open the **Workflow Cannon** activity bar for **Dashboard** (webview), **Guidance**, and related commands (see below). **Workspace configuration** is edited on **Dashboard → Config** (canonical); the activity-bar **Config** webview remains for supplementary access.

### Sidebar Dashboard vs palette **Open Status Dashboard**

These are **two different surfaces**, both fed by **`pnpm exec wk run dashboard-summary '{}'`**:

| Surface | How you open it | What it is |
|--------|-------------------|------------|
| **Sidebar Dashboard** | Activity bar → **Workflow Cannon** → **Dashboard** | Multi-tab webview: **Overview** (rollups + **Up next**), **Queue** (filters, queue, Ideas, planning), **Status** (compact identity / counts cards), **Config** (canonical kit/module key editor), **CAE**. |
| **Legacy Config webview** | Activity bar → **Workflow Cannon** → **Config** | Same config engine as **Dashboard → Config**; prefer the dashboard tab for day-to-day edits. |
| **Status dashboard panel** | Command palette → **Workflow Cannon: Open Status Dashboard** | **Editor-area** `WebviewPanel` for **phase/drift** and **`systemStatus`** — supplementary to **Dashboard → Status** (identity, counts, editor integration). **`StateWatcher`** debounces refresh (**`STATUS_PANEL_DEBOUNCE_MS`** in `StatusDashboardPanel.ts`, default **450ms**) while the tab stays open; **Refresh now** is immediate. |

Requires **`dashboard-summary`** **`data.schemaVersion` ≥ 5** (**`systemStatus`**). Schema **v6** adds **`systemStatus.identity`** and **`systemStatus.planningStore`**. The merged envelope may include **`data.cae`** for CAE shadow preflight — separate from **`caeLines`** inside **`systemStatus`**.

**Sidebar Dashboard refresh:** Besides the bottom **Refresh** button (immediate refetch), the sidebar dashboard reloads when the view becomes visible again, when kit-owned files change (workspace-kit watchers), and on a **~45s** timer while the view stays open.

**Tasks tree / drag-and-drop** were removed in extension **0.1.6** — use dashboard **View** on a task row and **`workspace-kit run run-transition`** / **`list-tasks`** from a terminal for transitions. Proposed-row **Accept**/**Chat** on the dashboard is unchanged.

## CLI bridge

The extension runs its bundled `@workflow-cannon/workspace-kit` CLI when available, then falls back to a built repo `dist/cli.js` or the attached workspace package path. If dashboard/tasks fail with “CLI not found”, run `pnpm run build` at the repo root. Workflow Cannon expects Node 22 for its CLI/runtime. The extension prefers `workflowCannon.nodeExecutable`, `WORKSPACE_KIT_NODE`, Workflow Cannon package/runtime `.node-version` / `.nvmrc` markers through nvm, common install paths, then `node` on `PATH`; it does not automatically follow the attached project’s Node markers. When native SQLite cannot load, the extension reports the Node candidates it considered, their version/architecture, and whether the `better-sqlite3` probe failed; set `workflowCannon.nodeExecutable` or `WORKSPACE_KIT_NODE` to a Node 22 executable and rebuild with `pnpm rebuild better-sqlite3` if needed.

**Copy-ready mutating JSON (operators):** From a terminal at the repo root, `pnpm exec wk run run-transition --schema-only` (and other pilot commands) prints **`sampleArgs`** you can paste and edit before running a real `wk run run-transition '<json>'`. Dashboard/Task transitions already inject **`expectedPlanningGeneration`** when policy is **`require`**; use the CLI helper when debugging shape errors. See **`docs/maintainers/plans/phase-52-human-cli-affordances.md`**.

**Role and phase signals:** **Role** / **Agent temperament** appear on the **Status** tab (from **`dashboard-summary`**). **Phase Readiness** (score, current phase line, checks) sits under **WC Agent** on the dashboard shell; refresh runs **`dashboard-summary`** only. Phase **Deliver** prefill is available from maintainer playbooks / CLI when you need it — it is not duplicated on the Overview shell.

**Team execution & subagent cards (CLI parity):** Both rollups ship inside packaged **`dashboard-summary`** JSON. When the kit task SQLite file is available to the CLI (**`sqliteDual`** in the kit) and **`PRAGMA user_version` ≥ 7**, **`teamExecution`** is built by **`summarizeTeamAssignmentsForDashboard`** over **`kit_team_assignments`** — the same rows as **`pnpm exec wk run list-assignments '{}'`** (counts and **`topActive`** are a bounded slice / aggregate of that table). When **`user_version` ≥ 6**, **`subagentRegistry`** is built by **`summarizeSubagentsForDashboard`** over **`kit_subagent_definitions`** / **`kit_subagent_sessions`**, matching the subagent list surfaces documented in **`.ai/AGENT-CLI-MAP.md`** (team/subagent inspect). If the DB is missing or the schema is below those thresholds, both objects return **`available: false`** with zeroed counts; the dashboard should show empty cards, not stale fabrications. Mutations remain terminal **`pnpm exec wk run …`** with JSON **`policyApproval`** where required. See **`docs/maintainers/runbooks/subagent-registry.md`** for subagent depth.

**Workspace root:** Cursor must open the folder that contains `.workspace-kit/manifest.json` (the Workflow Cannon repo root). If you open a parent directory, the extension will not attach and you get no dashboard/tasks—or you may be pointed at a different task store than you expect.

**Proposed vs ready:** The dashboard “Suggested next” and ready/proposed sections only reflect tasks in the configured task store. **`proposed`** improvement work appears under **Proposed improvements** on the dashboard (after a refresh). When **`dashboard-summary`** returns **`phaseBuckets`** with **`taskIds`**, each phase heading can show **Accept All** (routine dashboard policy trace; the extension refreshes the planning-generation token between each **`run-transition`** **`accept`**). Planning appears when a `build-plan` session file exists.

**Execution queue vs Ideas:** **Ready** / **proposed** rollups on **Overview** and the **Queue** tab follow the kit **execution queue**. **Status → Task Counts** uses **`stateSummary`** (store-wide); see the muted note under that grid when numbers diverge. **Up next** uses kit **`suggestedNext`** (ready tasks ordered by **current workspace phase**, then **next phase**, then priority). When no runnable ready work exists, the dashboard may surface the first open **Ideas** row. Full store: **`wk run list-tasks`**.

## Testing

- Unit + integration tests (Node-only, no Cursor binary):

```bash
pnpm run build
pnpm --filter cursor-workflow-cannon test
```

- Root **`pnpm run build`** is required first because integration tests invoke real `dist/cli.js` from the repository.

**Manual check (Ideas add):** Dashboard **Add idea** opens the in-webview drawer; submit runs **`create-idea`**. Success ends with a clear toast; validation / API errors show in the drawer strip; Cancel closes the drawer.

## Commands and operations

- `Workflow Cannon: Open Dashboard`
- `Workflow Cannon: Open Status Dashboard`
- `Workflow Cannon: Show Ready Queue`
- `Workflow Cannon: Prefill Chat — Planner Chat Playbook` (palette; optional idea id argument)
- `Workflow Cannon: Generate Features`
### Chat prefill (Cursor)

User-facing Cursor slash commands live under **`.cursor/commands/`**: **`/generate-features`**, **`/list-tasks`**, **`/what-next`**, **`/onboarding`**, and **`/behavior-interview`**.

The extension seeds Cursor Composer using **`vscode.commands.executeCommand("deeplink.prompt.prefill", { text })`** (same entry Cursor uses internally). In Standard VS Code, it uses detected command capabilities to prefer the native chat prefill command. The **`cursor://anysphere.cursor-deeplink/prompt?text=…`** URI fallback is only attempted when the editor URI scheme is **`cursor`**; otherwise the prompt is copied to the clipboard with a warning. The dashboard shows the detected editor integration state (editor, URI scheme, and chat prefill route). Very long prompts may hit URI length limits — trim in-session or paste from clipboard.

Dashboard and palette **Generate Features** open a **new** Agent/Composer chat when Cursor exposes a known **`composer.newAgentChat`** (or alias) command, then prefill the literal **`/generate-features`** string so submitting matches the slash command.

**Collaboration profiles** (quick action) prefills a chat that links **`/onboarding`**, **`/behavior-interview`**, and read-mostly **`pnpm exec wk run`** lines (`resolve-behavior-profile`, `list-behavior-profiles`, **`sync-effective-behavior-cursor-rule`**) — advisory only; **chat is not JSON `policyApproval`**.

Dashboard **Ideas** open rows include **Chat**; **Proposed · improvements** and **Proposed · execution** rows include **Accept** (in-webview drawer: target phase + **`policyApproval`** rationale for **`run-transition`** **`accept`**, then **`assign-task-phase`**) and **Chat** (improvement triage vs task-to-phase-branch playbook text). Agent canon: **`.ai/playbooks/`** (`planner-chat.md`, `improvement-triage-top-three.md`, `task-to-phase-branch.md`). Maintainer mirrors: `docs/maintainers/playbooks/`.

### Dashboard prompt surface (Phase 91)

For **sidebar Dashboard** actions that collect operator intent before a mutating **`workspace-kit run`** from the extension host, prefer the **in-webview drawer** (`#wc-drawer-host`, `wcDrawerOpen` / `drawerSubmit` / `wcDrawerValidation`) so users stay in the sidebar.

**Exceptions (native VS Code UI is OK):**

- **Command palette** flows and other non-Dashboard entry points.
- **Destructive / irreversible confirmations** outside the drawer contract (for example **`showWarningMessage`** modal gates where a modal is clearer than a webview affordance).
- **Transient notifications** (`showInformationMessage` / `showErrorMessage`) for outcomes.
- **Planning interview wizard** and similar legacy flows until migrated.

Do not add new **`await vscode.window.showInputBox`** / **`showQuickPick`** calls in `DashboardViewProvider.ts` for Dashboard-originated kit mutations — `extensions/cursor-workflow-cannon/test/dashboard-prompt-surface.test.mjs` fails the build if they appear (non-comment lines).

### Dashboard trace (operator debugging)

**View → Output → Workflow Cannon** logs extension activity with timestamps:

- **`[wk]`** — every `workspace-kit run …` (start `→`, end `←` with duration and ok/FAIL). This is the main signal for slow drawers and duplicate CLI calls.
- **`[dashboard]`** — drawer open/submit/cancel, `pushUpdate` cycles, Set Phase actions.
- **`[webview]`** — incoming webview `postMessage` types (only when verbose; see below).

Set **`WORKSPACE_KIT_DEBUG_DASHBOARD=1`** in the environment before launching Cursor (or the Extension Development Host) to also log webview message types and scheduled refresh debounces.

Logs go to the **Workflow Cannon** output channel only (not duplicated into **Log (Extension Host)**).

Manual operator checklist: `docs/e2e.md`  
Security notes: `SECURITY.md`

Dashboard contract example: `docs/fixtures/dashboard-summary.example.json`

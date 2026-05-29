<!-- GENERATED FROM .ai/runbooks/task-state-git-operator.md — edit that file; do not hand-edit this render (see docs/maintainers/adrs/ADR-ai-canonical-maintainer-docs-pipeline.md) -->

# Task-state git operator loop (`git-event-log`)

Operators and agents when **`tasks.canonicalAuthority`** is **`git-event-log`** (see **`tasks.canonicalAuthority`** in **`.ai/CONFIG.md`**). The **canonical** execution history lives on git branch **`workflow-cannon/task-state`**. Local files under **`.workspace-kit/tasks/`** are **projections**, not merge targets on **`main`**.

**SQLite layout and recovery (non-git):** [`.ai/runbooks/task-persistence-operator.md`](./task-persistence-operator.md).

---

## What is authoritative

| Surface | Role |
| --- | --- |
| **`origin/workflow-cannon/task-state`** | Canonical append-only task-state events (+ manifest/snapshots on branch layout) |
| **`.workspace-kit/tasks/workspace-kit.db`** | Local SQLite projection for runtime, dashboard, and `wk run` |
| **`.workspace-kit/tasks/task-state-events.jsonl`** | Local materialization target after **hydrate** — not a substitute for the branch |
| **`docs/maintainers/data/workspace-kit-status.yaml`** | Maintainer export snapshot (phase labels, etc.) — **not** the task queue |

Routine **`git pull`** on **`main`** must **not** require merging a teammate’s **`workspace-kit.db`**.

---

## After `git pull` / `git checkout` (every operator)

1. If git reports local changes on tracked DB/JSONL files, **discard** them (they are stale projections):

   ```bash
   git checkout -- .workspace-kit/tasks/workspace-kit.db .workspace-kit/tasks/task-state-events.jsonl
   ```

   Or stash only those paths if you must keep a forensic copy elsewhere.

2. **Reconcile** from canonical git:

   ```bash
   pnpm exec wk run task-state-hydrate '{"fetch":true,"policyApproval":{"confirmed":true,"rationale":"reconcile task store after pull"}}'
   ```

   **Automatic:** with **`install-git-hooks`**, **post-merge** and **post-rewrite** run the same hydrate path after **`git pull`** / rebase (when **`tasks.canonicalAuthority`** is **`git-event-log`**). With the Workflow Cannon extension, **Sync on git HEAD change** (default on) and the background interval also reconcile without manual steps.

3. Confirm:

   ```bash
   pnpm exec wk run task-state-status '{}'
   pnpm exec wk doctor
   ```

**Extension:** Workflow Cannon can background-sync via **Sync Task State (Git)**; CLI hydrate remains the recovery path when doctor reports divergence or pull left a dirty tracked blob.

---

## While working (agents / parallel branches)

- Mutations go through **`workspace-kit run`** (`run-transition`, `create-task`, …). With **`git-event-log`**, the kit publishes events to **`workflow-cannon/task-state`** (see **`task-state-publish`**).
- **Do not** commit **`.workspace-kit/tasks/workspace-kit.db`** or **`task-state-events.jsonl`** on feature branches or **`main`** except the **recovery** path below.
- **`pnpm exec wk run check-task-store-commit '{}'`** — fails if live SQLite is **staged** without approval (also surfaced in **`doctor`**).
- Legacy recovery on a feature branch only: **`sync-task-store-after-merge`** or **`task-state-hydrate`** — prefer hydrate when authority is **`git-event-log`**.

### Phase 119 — planning canonical sync (catalog + workspace status)

When **`tasks.canonicalAuthority`** is **`git-event-log`**, these domains publish **`planning.*`** events on the same **`workflow-cannon/task-state`** stream as **`task.*`**:

- **`kit_phase_catalog`** — `planning.phase_catalog.upserted` / `.removed` (via **`upsert-phase-catalog-entry`**)
- **`kit_workspace_status`** — `planning.workspace_status.updated` (via **`update-workspace-status`**, **`set-current-phase`** where wired)

**Hydrate** / **rebuild-task-state-cache** replays planning events into SQLite in shared sequence order. **Doctor** surfaces planning projection drift as an advisory hint (run **`task-state-hydrate`**).

One-time seed when the remote log lacks planning events: **`planning-state-migrate-baseline`** (dry-run first; **`overwriteExisting:true`** only with operator intent). Instruction: **`src/modules/task-engine/instructions/planning-state-events.md`**.

---

## Phase closeout / merge to `main`

See **`.ai/playbooks/phase-closeout-and-release.md`** § **3a**. Summary:

1. On **`release/phase-<N>`** tip: publish outstanding task-state events and push **`workflow-cannon/task-state`**.
2. **`task-state-verify`** against **`origin/workflow-cannon/task-state`**.
3. Merge phase branch to **`main`** **without** committing **`workspace-kit.db`** / **`task-state-events.jsonl`** as closeout artifacts.
4. After updating **`main`**: every clone runs **hydrate** (above).

---

## Recovery-only SQLite commit (rare)

When a documented migration or corruption repair **requires** committing a SQLite blob:

1. **`pnpm exec wk run backup-planning-sqlite`** with an **`outputPath`** under **`.workspace-kit/backups/`** (gitignored).
2. Write **`.workspace-kit/policy/task-store-sqlite-commit-approval.json`**:

   ```json
   {"confirmed":true,"rationale":"one-line recovery reason","expiresAt":"2026-12-31T23:59:59.000Z"}
   ```

3. Stage **only** the intended paths; **`pnpm exec wk run check-task-store-commit '{}'`** must pass.

This is **not** phase closeout and **not** parallel-agent routine work.

---

## Related commands

| Command | Use |
| --- | --- |
| `task-state-status` | Read-only local vs remote alignment |
| `task-state-hydrate` | Fetch branch → JSONL → rebuild SQLite |
| `task-state-publish` | Append events + push branch |
| `task-state-verify` | Integrity check on branch layout |
| `rebuild-task-state-cache` | Rebuild DB from local JSONL only |
| `check-task-store-commit` | Block accidental staged `.db` |

Instructions: `src/modules/task-engine/instructions/task-state-*.md`.

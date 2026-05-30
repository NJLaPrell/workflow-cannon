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

## Routine workflow (local-first, no manual sync chores)

After `git pull` / `git checkout`, operators should continue normal work without running manual sync commands.

1. Use `workspace-kit run` mutation commands normally (`run-transition`, `create-task`, `update-task`, ...). Success means the local write landed and canonical sync is handled by the runtime publish path.
2. Use dashboard/CLI sync posture (`task-sync-status`, dashboard projection) as visibility, not as a required preflight for every branch switch.
3. Do not run `task-sync-hydrate` / `task-sync-publish` on every pull. Those commands are recovery/admin paths only (`task-state-*` recovery aliases remain callable).

**Automatic:** with **`install-git-hooks`**, **post-merge** and **post-rewrite** run hydrate when needed (when **`tasks.canonicalAuthority`** is **`git-event-log`**). The Workflow Cannon extension also reconciles in the background (**Sync on git HEAD change** + interval).

### Recovery/admin triggers

Run manual sync only when there is a concrete issue:

- `doctor` reports projection drift or stale tracked task-state blobs.
- `task-sync-status` reports `behind`, `conflict`, or unpublished outbox events that are not draining.
- A maintainer is performing explicit closeout or repair operations.

---

## While working (agents / parallel branches)

- Mutations go through **`workspace-kit run`** (`run-transition`, `create-task`, …). Routine behavior is local-first commit with canonical sync draining in the background/outbox flow.
- **Do not** commit **`.workspace-kit/tasks/workspace-kit.db`** or **`task-state-events.jsonl`** on feature branches or **`main`** except the **recovery** path below.
- **`pnpm exec wk run check-task-store-commit '{}'`** — fails if live SQLite is **staged** without approval (also surfaced in **`doctor`**).
- Legacy recovery/admin only: **`sync-task-store-after-merge`** or **`task-sync-hydrate`** — prefer hydrate when authority is **`git-event-log`**.

### Phase 119 — planning canonical sync (catalog + workspace status)

When **`tasks.canonicalAuthority`** is **`git-event-log`**, these domains publish **`planning.*`** events on the same **`workflow-cannon/task-state`** stream as **`task.*`**:

- **`kit_phase_catalog`** — `planning.phase_catalog.upserted` / `.removed` (via **`upsert-phase-catalog-entry`**)
- **`kit_workspace_status`** — `planning.workspace_status.updated` (via **`update-workspace-status`**, **`set-current-phase`** where wired)

**Hydrate** / **rebuild-task-state-cache** replays planning events into SQLite in shared sequence order. **Doctor** surfaces planning projection drift as an advisory hint (run **`task-sync-hydrate`**).

One-time seed when the remote log lacks planning events: **`planning-state-migrate-baseline`** (dry-run first; **`overwriteExisting:true`** only with operator intent). Instruction: **`src/modules/task-engine/instructions/planning-state-events.md`**.

---

## Phase closeout / merge to `main`

See **`.ai/playbooks/phase-closeout-and-release.md`** § **3a**. Summary:

1. On **`release/phase-<N>`** tip: publish outstanding task-state events and push **`workflow-cannon/task-state`**.
2. **`task-sync-verify`** against **`origin/workflow-cannon/task-state`**.
3. Require an outbox-drained closeout check (or explicit maintainer waiver) before phase → `main`.
4. Merge phase branch to **`main`** **without** committing **`workspace-kit.db`** / **`task-state-events.jsonl`** as closeout artifacts.
5. After updating **`main`**: every clone runs **hydrate** (above).

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
| `task-sync-status` | Read-only local vs remote alignment |
| `task-sync-hydrate` | Fetch branch → JSONL → rebuild SQLite |
| `task-sync-publish` | Append events + push branch |
| `task-sync-verify` | Integrity check on branch layout |
| `rebuild-task-state-cache` | Rebuild DB from local JSONL only |
| `check-task-store-commit` | Block accidental staged `.db` |

Preferred **`task-sync-*`** names; legacy **`task-state-*`** recovery aliases use the same argv. Instructions: `src/modules/task-engine/instructions/task-sync-*.md`.

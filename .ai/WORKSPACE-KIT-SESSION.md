# Workspace kit session snapshot (agents)

**Audience:** automated agents. **Do not** treat `docs/maintainers/ROADMAP.md` or `docs/maintainers/data/workspace-kit-status.yaml` as required reading for routine work.

## Maintainer delivery (before you commit)

When implementing scoped **`T###`** work: **branch from `release/phase-<N>`** (or the current phase integration branch), run **`run-transition`** **`start`** **no later than the first implementation commit** on that task branch, then **PR → review → merge** into the phase branch. Do not treat “code is done” as enough without the GitHub + **`run-transition`** **`complete`** evidence path — **`.ai/playbooks/task-to-phase-branch.md`**, **`.cursor/rules/maintainer-delivery-loop.mdc`**.

**Machine hints:** **`get-next-actions`**, **`agent-session-snapshot`**, and **`agent-bootstrap`** include **`maintainerDelivery`** (playbook paths, suggested `release/phase-<key>` branch, **`inProgressTasks`**, optional metadata on the suggested task). **`pnpm exec wk doctor --delivery-loop`** prints an advisory when the working tree is **dirty** on **`main` / `master` / `release/phase-<n>`** while execution tasks are **`in_progress`**; **`--delivery-loop-strict`** fails **`doctor`** instead.

**Optional task metadata** (for agents / reporting): **`metadata.maintainerDeliveryProfile`** (string, e.g. **`github-pr`**) and **`metadata.requiresPhaseBranch`** (boolean). They are echoed inside **`maintainerDelivery`** when present.

## Refresh execution context

1. Run `pnpm exec wk doctor` (or `node dist/cli.js doctor`) from the repo root. For the **machine-readable instruction catalog** (executable vs documentation-only commands, remediation codes), run `pnpm exec wk doctor --agent-instruction-surface` and keep the JSON output handy before relying on a bare `wk run` text menu. For a **digest-only** catalog (compare `instructionSurfaceDigest` to a cached full payload), use `pnpm exec wk doctor --agent-instruction-surface-lean` or add **`--agent-instruction-surface-lean`** alongside the base flag.
2. For a **single argv cold start** (doctor-equivalent contract checks **plus** the composed session bundle), run **`pnpm exec wk run agent-bootstrap '{}'`** (read-only; includes `planningGeneration`, `suggestedNext`, queue health, phase hints). Use **`pnpm exec wk run agent-bootstrap '{"projection":"lean"}'`** to also attach the **lean** instruction-surface digest (same shape as doctor lean). Otherwise use **`pnpm exec wk run agent-session-snapshot '{}'`** alone when doctor was already run separately, or `pnpm exec wk run get-next-actions '{}'` plus `pnpm exec wk run list-tasks '<json-filter>'` for granular reads (do not insert `pnpm`’s `--` between `wk` and `run` — it breaks the CLI).
3. **Per-command argv JSON Schema + samples** (generated, CI-checked): see `.ai/agent-cli-snippets/INDEX.json` and `by-command/*.json` — prefer loading one command’s snippet over pasting in the entire `.ai/AGENT-CLI-MAP.extended.md`.
4. For **Tier A / Tier B** mutating `wk run` commands, use **`pnpm exec wk run <cmd> --schema-only`** first, edit the emitted **`sampleArgs`**, then add JSON **`policyApproval`** when required — see `.ai/machine-cli-policy.md` tier table.
5. **Glossary + routing hubs:** machine term index for **`.ai/TERMS.md`** → **`.ai/TERMS.index.json`** (regenerate: `node scripts/generate-terms-index.mjs`; CI `terms-index` stage). Subtree entrypoints for agents → **`HUB.md`**: **`.ai/cae/README.md`**, **`.ai/runbooks/README.md`**, **`.ai/adrs/README.md`**.
6. Task queue reads: **`list-tasks`** supports **`id`** / **`ids`** / **`idPrefix`**, plus **`limit`** + opaque **`nextCursor`** pagination (stable sort: `updatedAt` desc, numeric `T###` tie-break). **`create-task`** supports **`allocateId:true`** (omit **`id`**) and **`dryRun:true`**. **`apply-task-batch`** runs multiple **`create-task`** / **`update-task`** shapes in one transaction; **`update-task`** also accepts **`dryRun:true`**.
7. Treat the configured task store (SQLite `.workspace-kit/tasks/workspace-kit.db`; legacy `.workspace-kit/tasks/state.json` is **import/migrate only**, not a live runtime backend) as authoritative for `status`, `id`, and queue ordering.

**Workspace phase snapshot:** canonical **`current_kit_phase` / `next_kit_phase`** for kit readers live in **`kit_workspace_status`** (planning SQLite, **`user_version` ≥ 10**). Use **`workspace-kit run phase-status '{}'`** to read phase, drift, export freshness, and optional task counts. Use **`workspace-kit run set-current-phase ...`** for the SQLite-first happy-path phase mutation; **`update-workspace-phase-snapshot`** and **`update-workspace-status`** are compatibility / low-level surfaces. **`kit.currentPhaseNumber`** is a **bootstrap / UX hint** only — it does **not** override the DB row; **`doctor`** may note drift but does not fail on config vs DB mismatch (see **`.ai/runbooks/workspace-status-sqlite.md`**). Per-task **`phaseKey`** in the task store is separate from this snapshot.

## Humans vs agents

- **Maintainers** edit long-form strategy in `docs/maintainers/ROADMAP.md`, `docs/maintainers/CHANGELOG.md`, and the status YAML snapshot under `docs/maintainers/data/`.
- **Agents** use this file, `.ai/AGENTS.md`, `.ai/machine-cli-policy.md`, `.ai/MACHINE-PLAYBOOKS.md`, `src/modules/*/instructions/*.md`, and CLI JSON output—not `docs/maintainers/*` prose—for operating procedures.

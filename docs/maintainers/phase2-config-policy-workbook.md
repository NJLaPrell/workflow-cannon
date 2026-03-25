# Phase 2 workbook — config, policy, local task cutover

Binding design for `v0.4.0` (tasks `T218` → `T187` → `T200` → `T188` → `T201` → `T189`).  
Implementation must match this document unless a deliberate decision update is recorded in `docs/maintainers/TASKS.md` and here.

## 1. Non-goals for v0.4.0

- **No** generic migration orchestration API, staged migration runner, or rollback engine shipped in `@workflow-cannon/workspace-kit`.
- **No** requirement for persistent approval artifacts (files, DB) for baseline; **agent-mediated** confirmation is sufficient.
- Consumer repos are **not** auto-migrated; maintainer cutover for **this** repository is **opt-in** and **local**.

## 2. Project (global) vs module-level configuration

- **Project configuration (global / workspace-wide)** — values that apply to the **entire workspace** and are owned by the repo maintainer. Primary source: **`.workspace-kit/config.json`** (include `schemaVersion`). May use **top-level domain keys** (`core`, `tasks`, `documentation`, …) and/or a **`modules`** object for overrides targeted at a specific module id (e.g. `modules["task-engine"].storePath`) so global file can tune one module without scattering files.
- **Module-level configuration** — defaults and schema owned by **each module**, loaded from that module’s registration contract / **`config.md`** (and compiled defaults in code if any). One **logical config document per module**; merged only into that module’s domain (or declared export surface), not copied into other modules’ namespaces.

**Where it lives (persistence):** Durable config is **files and env**, not a database. **Project** settings: `.workspace-kit/config.json`. **Module** defaults: shipped **`config.md`** / code (and optionally future generated snapshots — still files). **Task state** today is the same family of persistence: **JSON under `.workspace-kit/tasks/`**, not a shared DB. There is **no** “config table” alongside tasks; effective config is always **computed** from these layers at runtime.

Effective values for a given key path are always the result of the precedence stack below; **explain-config** must report whether the winning layer was **project**, **module**, **kit default**, **env**, or **invocation**.

## 3. Config precedence (low → high)

1. **Kit built-in defaults** — compiled per-domain / per-module fallbacks.
2. **Module-level contributions** — for each enabled module, its static config; modules merged in **registry dependency order** (topological). **Later modules win** on overlapping keys in **shared** or **cross-cutting** namespaces only where the registry explicitly allows it; otherwise collisions are a **validation error** at resolve time. (Module-specific subtrees remain isolated by module id / domain.)
3. **Project (global) configuration** — `.workspace-kit/config.json` (and structured content only; no second file required for v0.4.0). **Overrides** the merged module layer for any path the project defines. This is the maintainer-controlled **global** knob.
4. **Environment** — `WORKSPACE_KIT_*`; nested keys use `__`, e.g. `WORKSPACE_KIT_TASKS__STORE_PATH`. Overrides project file for the same logical path (CI / local overrides).
5. **Invocation overrides** — highest: JSON on `workspace-kit run <cmd> '<json>'` when the command accepts a `config` (or scoped) override.

**Merge semantics (default):** scalars and arrays: higher layer **replaces** lower; objects: **deep merge** with higher layer winning on leaf conflict. Workbook exceptions must name the field path.

## 4. Typed registry

- **Domains** (initial): `core`, `tasks` (task-engine), `documentation` — extend as modules register. Each domain’s effective config combines **module-level** sources for that domain with **project (global)** overrides from precedence layer 3.
- **Validation:** fail closed at load or first resolve with stable error codes (to be aligned with implementation taxonomy).
- **Explain:** agent-first JSON only — implement as `workspace-kit run` command, e.g. `explain-config`, accepting `{ "path": "tasks.storePath" }` (exact name in implementation; must be listed in module registry).

Explain output shape (logical):

- `path`, `effectiveValue`, `winningLayer`, `alternates` (layer + value, low-to-high or high-to-low — pick one in code and document in command help).

## 5. Sensitive operations (policy baseline)

Operations that **mutate** or **overwrite** user content or task state **require** policy approval context (unless dry-run / read-only mode explicitly documented per command).

| Operation ID | Scope (baseline) |
| --- | --- |
| `cli.upgrade` | `workspace-kit upgrade` |
| `cli.init` | `workspace-kit init` when it writes artifacts |
| `doc.document-project` | `document-project` when batch would write (not dry-run or overwrites enabled) |
| `doc.generate-document` | `generate-document` when would write (not dry-run or overwrites enabled) |
| `tasks.import-tasks` | task-engine `import-tasks` |
| `tasks.generate-tasks-md` | task-engine `generate-tasks-md` |
| `tasks.run-transition` | task-engine `run-transition` |

**Explicitly not gated (baseline):** `doctor`, `check`, `drift-check`, `run` listing, read/query task commands (`list-tasks`, `get-task`, `get-ready-queue`, `get-next-actions`), documentation commands with `dryRun: true` and no writes.

New write commands **default to sensitive** unless registered as exempt in code with rationale.

## 6. Approvals (agent-mediated)

- Coding agent must obtain **explicit user confirmation** in-session before calling a sensitive operation.
- Command context carries approval, e.g. `{ "policyApproval": { "confirmed": true, "rationale": "user approved upgrade in chat" } }` (exact shape implemented in T188; must be stable JSON).
- Policy layer: if sensitive and not satisfied → deterministic denial with typed error; no interactive `prompt()` in CLI required for `v0.4.0`.

## 7. Actor resolution

Order (first hit wins):

1. JSON arg `actor` on the `run` invocation (if present).
2. Environment variable `WORKSPACE_KIT_ACTOR`.
3. `git config user.email`; if missing, `git config user.name`.
4. Literal `"unknown"`.

## 8. Policy decision traces

- Append or write structured JSON records (implementation chooses single file vs directory under `.workspace-kit/policy/` — must be documented in `T188` completion notes).
- Each record minimally: `timestamp`, `operationId`, `actor`, `allowed`, `rationale`, `command`, optional `configHash`.

## 9. Maintainer-local task cutover (outline for T189 / T201)

High-level steps (details in `T201` checklist and `T189` runbook):

1. Branch from `main`; backup `docs/maintainers/TASKS.md` and any existing `.workspace-kit/tasks/`.
2. Run `import-tasks` with approvals per policy; inspect `.workspace-kit/tasks/state.json`.
3. Run `generate-tasks-md`; review diff (read-only markdown should match team expectations).
4. Open PR; attach optional local evidence JSON from rehearsal if used.

Rollback: restore backed-up files; delete or revert task state file; return to markdown-as-source workflow.

## 10. Revision history

| Date | Change |
| --- | --- |
| 2026-03-25 | Initial workbook from Phase 2 planning decisions. |
| 2026-03-25 | Split **project (global)** vs **module-level** config; project file overrides merged module layer; env/run above project. |
| 2026-03-25 | Clarified persistence: config and task state are **file/env** only; no config DB. |
| 2026-03-25 | Implementation shipped in `@workflow-cannon/workspace-kit` **v0.4.0** (resolver, `explain-config`, CLI policy, traces). |

# Architecture Overview

This document is a **maintainer-facing system map** for Workflow Cannon (`@workflow-cannon/workspace-kit`). For phase history and release intent, see [`ROADMAP.md`](./ROADMAP.md).

## System intent

Workflow Cannon is a modular CLI-first workflow platform: structured **tasks** and **wishlist** ideation, **policy-governed** sensitive operations, optional **SQLite** persistence, and capability **modules** registered behind a single command router. A thin **Cursor extension** consumes JSON from `workspace-kit run` (no direct reads of `.workspace-kit/` state files in the webview).

## Runtime shape

### CLI entry

- `workspace-kit` (`src/cli.ts`) resolves the workspace, builds **effective config** (layered: kit defaults → module defaults → project → env → invocation), constructs a **`ModuleRegistry`** from `defaultRegistryModules` (`src/modules/index.ts`), and dispatches `run` / `config` / `doctor` / `upgrade` / `init`.

### Module registry

- **`defaultRegistryModules`** lists the shipped bundle: `workspace-config`, `documentation`, `agent-behavior`, `task-engine`, `approvals`, `planning`, `improvement` (see [`src/modules/README.md`](../../src/modules/README.md)).
- Registry validates **`dependsOn`**, honors **`optionalPeers`** / **`requiresPeers`** on instruction entries, and determines startup order.
- Modules can be disabled via workspace config; disabled modules omit their commands from the router (see **Agent instruction surface** in [`TERMS.md`](./TERMS.md)).

### Command router

- **`ModuleCommandRouter`** (`src/core/module-command-router.ts`) aggregates **executable** commands for the enabled module set and resolves aliases.
- **`workspace-kit run` with no subcommand** lists discovered commands (agent discovery path; see [`AGENT-CLI-MAP.md`](./AGENT-CLI-MAP.md)).
- **`workspace-kit doctor --agent-instruction-surface`** returns the full **declared** instruction catalog (including documentation-only rows when peers are missing), distinct from router registration.

### Policy and approvals

- Sensitive `workspace-kit run` commands map to **`PolicyOperationId`** values for traces and **`policyApproval`** JSON (Tier A/B per [`POLICY-APPROVAL.md`](./POLICY-APPROVAL.md)).
- Builtin **`workspace-kit run`** commands are declared in **`src/contracts/builtin-run-command-manifest.json`** (loaded by `builtin-run-command-manifest.ts`): instruction file, optional **`policyOperationId`**, optional default response-template id. Policy aggregates sensitive bindings in `src/core/policy.ts`.
- `init` / `upgrade` / **`config` mutations** use env-based **`WORKSPACE_KIT_POLICY_APPROVAL`**, not the `run` JSON field.

### Configuration

- Typed keys and metadata live in the config registry; **`workspace-kit config`** and **`resolve-config`** / **`explain-config`** expose deterministic resolution for agents and humans.

### Persistence

- **Tasks** and **wishlist** default to **SQLite** (`tasks.persistenceBackend: sqlite`, one file under `tasks.sqliteDatabaseRelativePath`). Set **`tasks.persistenceBackend: json`** to use JSON files instead (see `docs/maintainers/ADR-sqlite-default-persistence.md` and `ADR-task-sqlite-persistence.md`).
- **Unified module state** (Phase 18 track) extends SQLite for additional module rows and CLI introspection (`get-module-state`, `list-module-states`) where enabled.

## Layering and known exceptions

- **Intended rule:** `modules/` may depend on `core/` and `contracts/`; avoid **sibling module** imports.
- **Exceptions (stable facades):**
  - **`src/core/planning/index.ts`** re-exports task-engine–owned planning stores and types so **planning**, **approvals**, and **improvement** import from `core/planning` instead of deep `task-engine` paths (implementations remain in task-engine).
  - **`src/core/config-cli.ts`** imports **`defaultRegistryModules`** to bootstrap the registry for config resolution (documented exception to keep CLI wiring centralized).
- **`src/README.md`** summarizes boundary intent; this section is the maintainer detail.

### Planning module vs planning persistence

- **Planning module** (`src/modules/planning/`): user-facing **`build-plan`** interviews, rules, and wishlist artifact output.
- **Planning persistence** (task-engine / SQLite): **`openPlanningStores`**, `TaskStore`, `WishlistStore`, migrations — shared **execution** state for tasks and wishlist. The planning **module** consumes the facade under `core/planning`; it does not own the store implementations.

## Key building blocks (concise)

| Area | Role |
| --- | --- |
| **contracts** | `WorkflowModule`, instruction contracts, shared types |
| **core** | Router, policy, config resolution, transcript hooks, unified DB helpers |
| **modules** | Feature capabilities (task-engine, planning, documentation, …) |
| **cli** | User-facing commands and `handleRunCommand` |
| **extensions/cursor-workflow-cannon** | Thin client; calls packaged `workspace-kit run` |

## Foundational principles

- Safety and trustworthiness over speed; deterministic supported paths; evidence-backed changes (see [`.ai/PRINCIPLES.md`](../../.ai/PRINCIPLES.md)).

## Documentation precedence

When instructions conflict, follow the ordered list in [`AGENTS.md`](./AGENTS.md) (**Source-of-truth order**). In short: **`.ai/`** holds machine-oriented module contracts; **`docs/maintainers/`** holds human maintainer canon; **`.cursor/rules/`** mirror enforcement and must not contradict maintainer docs.

## Related docs

- [`CLI-VISUAL-GUIDE.md`](./CLI-VISUAL-GUIDE.md) — ASCII + Mermaid map of top-level commands, `run` router, and approval lanes (companion to [`AGENT-CLI-MAP.md`](./AGENT-CLI-MAP.md))
- [`ROADMAP.md`](./ROADMAP.md) — phases (including Phase 18 module platform + state consolidation and Phase 19 documentation v2)
- Task execution queue — default SQLite `.workspace-kit/tasks/workspace-kit.db`; JSON opt-out `.workspace-kit/tasks/state.json`
- [`RELEASING.md`](./RELEASING.md) — release gates and evidence
- [`.ai/PRINCIPLES.md`](../../.ai/PRINCIPLES.md) — decision priorities
- [`module-build-guide.md`](./module-build-guide.md) — module authoring
- [`TERMS.md`](./TERMS.md) — glossary and workflow vocabulary

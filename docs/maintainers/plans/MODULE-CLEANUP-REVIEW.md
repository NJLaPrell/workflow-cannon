# Module Build: Docs vs. Reality Review

> Snapshot comparison of the module-build contract against actual module implementations.
> Generated 2026-03-27. Revisit when ready to act on cleanup items.

---

## What the Docs Say

The module-build contract (`.ai/module-build.md` and `docs/maintainers/module-build-guide.md`) lays out:

1. Implement `WorkflowModule` with full `registration` (id, version, contractVersion, capabilities, dependsOn, enabledByDefault, config, state, instructions)
2. Each module lives in `src/modules/<name>/` with `config.md`, `state.md`, `instructions/*.md`
3. **No sibling module imports** — depend only on `core/` and `contracts/`
4. Deterministic handlers for supported inputs
5. Use the command router for dispatch
6. Lifecycle hooks: `onInstall`, `onConfigChange`, `onStart`, `onStop`, `onEvent`, `onCommand`
7. Instruction entries must match real files, validated by `ModuleRegistry`
8. Keep AI docs and human docs aligned

## What the Code Actually Does

Six modules exist: `approvals`, `documentation`, `improvement`, `planning`, `task-engine`, `workspace-config`.

---

## Divergences

### 1. Sibling Module Imports Are Everywhere

The docs say "no direct sibling module imports." Three of six modules reach directly into `task-engine`:

- **`planning`** imports `openPlanningStores`, `validateWishlistIntakePayload`, `buildWishlistItemFromIntake`, wishlist types
- **`approvals`** imports `openPlanningStores`, `TransitionService`, `TaskEntity` types
- **`improvement`** imports `openPlanningStores`, `TransitionEvidence` types

`task-engine` is effectively a shared domain library, not a peer module.

### 2. Lifecycle Hooks Are Dead Letters

The contract declares `onInstall`, `onConfigChange`, `onStart`, `onStop`, and `onEvent` — but none are called anywhere in the runtime. The CLI entry (`run-command.ts`) goes straight to `router.execute()`. These hooks are aspirational furniture.

### 3. `onCommand` Is a God-Method If-Chain

Every module implements `onCommand` as a giant chain of `if (command.name === "...")` blocks. `task-engine` has 30+ branches in a single method spanning ~800 lines. No handler registry, no dispatch table — just raw if-chains.

### 4. Module Discovery Is Static, Not Dynamic

Modules are hardcoded in three separate arrays:

- `src/cli/run-command.ts`
- `src/cli/doctor-planning-issues.ts`
- `src/core/config-cli.ts`

Adding a module means updating all three by hand.

### 5. Unregistered Instruction File

`documentation-maintainer.md` lives in `src/modules/documentation/instructions/` but is not listed in the module's `registration.instructions.entries`. The registry validates registered entries exist on disk, but doesn't flag orphan files.

### 6. Inconsistent Internal Structure

| Module | Extra files beyond `index.ts` | Pattern |
|--------|-------------------------------|---------|
| `workspace-config` | None — everything in `index.ts` | Minimal |
| `approvals` | `review-runtime.ts`, `decisions-store.ts` | Runtime + store |
| `documentation` | `runtime.ts`, `types.ts`, `schemas/`, `templates/`, `RULES.md` | Kitchen sink |
| `planning` | `types.ts`, `question-engine.ts`, `artifact.ts` | Domain logic split |
| `improvement` | `*-runtime.ts`, `confidence.ts`, `ingest.ts`, `*-state.ts`, `*-redaction.ts` | Many small files |
| `task-engine` | 15+ files, validation, stores, services, transitions, migrations | Full subdomain |

No consistent decomposition pattern.

### 7. `task-engine` Exports Way Too Much

`task-engine/index.ts` re-exports ~30 symbols — stores, services, validators, types, config helpers. The module barrel at `src/modules/index.ts` also re-exports task-engine internals. This violates the boundary contract and makes task-engine unreformable without breaking consumers.

---

## Patterns to Keep

1. **`WorkflowModule` + `ModuleRegistration` contract** — Typed registration with instruction validation at construction time. Solid.
2. **`ModuleCommandRouter` dispatch** — Clean separation: registry indexes, router resolves, module handles.
3. **Topological dependency sorting** — `dependsOn` with cycle detection and enabled-module validation.
4. **Instruction-as-markdown** — `.md` files describing each command's contract, great for agent consumption.
5. **`config.md` / `state.md` per module** — Documents config surface without runtime coupling.
6. **Deterministic `ModuleCommandResult`** — Structured `{ ok, code, message, data }` return shape. Clean, testable.

---

## Recommended Cleanups

### 1. Extract shared planning domain from `task-engine`

Pull `openPlanningStores`, `TaskStore`, `WishlistStore`, `TransitionService`, validation helpers, and shared types into `src/contracts/planning-contract.ts` or `src/core/planning/`. Then the "no sibling imports" rule can actually be enforced.

### 2. Centralize module enrollment

Replace the three hardcoded arrays with a single `src/modules/all-modules.ts` barrel. One place to add a module, not three.

### 3. Replace `onCommand` if-chains with a handler map

Each module declares a `Record<string, CommandHandler>` instead of a god-method. Makes each handler independently testable, keeps `index.ts` thin.

### 4. Kill or implement unused lifecycle hooks

Either wire up startup/shutdown sequencing that calls `onStart`/`onStop`, or remove them from the contract. Dead code is lying code. Lean toward removing until there's a real use case.

### 5. Register or remove `documentation-maintainer.md`

Either add it to `documentationModule.registration.instructions.entries` or move it out of `instructions/`. Orphan instruction files look callable but aren't.

### 6. Standardize internal module structure

Pick a convention and document it. Suggested layout:

```
src/modules/<name>/
  index.ts           # registration + onCommand dispatch (thin)
  handlers/          # one file per command (or grouped by domain)
  types.ts           # module-specific types (optional)
  config.md
  state.md
  instructions/      # one .md per registered command
  README.md          # optional
```

### 7. Tighten `task-engine` exports

After extracting the shared planning domain (#1), lock down what `task-engine` exports to only its genuine public API.

### 8. Sync docs with code

After #1 so the "no sibling imports" rule is truthful. Update `.ai/module-build.md` and `docs/maintainers/module-build-guide.md`.

---

## Priority Order

| Priority | Cleanup | Rationale |
|----------|---------|-----------|
| **1** | Extract shared planning domain from task-engine | Unblocks boundary enforcement; biggest structural debt |
| **2** | Centralize module enrollment | Trivial fix, prevents real bugs |
| **3** | Handler map pattern for `onCommand` | Readability + testability; task-engine index.ts is 1200+ lines |
| **4** | Kill unused lifecycle hooks | Remove dead code from the contract |
| **5** | Register/remove orphan instruction file | Quick consistency fix |
| **6** | Standardize internal module structure | Convention clarity for future modules |
| **7** | Tighten task-engine exports | Enforce after #1 and #3 |
| **8** | Sync docs with code | Do after #1 so the rule is truthful |

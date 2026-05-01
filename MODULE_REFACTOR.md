# MODULE_REFACTOR.md

## Composer 2 handoff brief

You are the implementation agent for the Workflow Cannon module-standardization effort. Treat this file as the execution controller for the refactor.

Your first job is **not** to refactor code. Your first job is to audit the current module system, confirm the actual state of the repo, and then make the smallest safe improvements in the order below.

The central rule: **do not turn a documentation/organization refactor into a behavior refactor.**

## Mission

Make every Workflow Cannon module self-describing, easy for agents to modify safely, and mechanically checkable, while preserving runtime behavior, public exports, command names, command payloads, policy behavior, and persistence semantics.

## Agent operating protocol

Follow this protocol for every task in this file:

1. Read the task and its dependencies.
2. Inspect the current repo state before editing.
3. Identify canonical sources before editing docs.
4. Make the smallest coherent change.
5. Prefer one module per code-moving task.
6. Preserve runtime behavior unless the task explicitly authorizes behavior changes.
7. Run the relevant checks/tests.
8. Update this file or the task evidence if the task changes the plan.
9. Stop and report if a task requires an architecture decision not already made.

## Absolute guardrails

Do **not** accidentally do any of the following:

- Rename shipped `workspace-kit run` commands.
- Change command payload contracts.
- Change command behavior while moving files.
- Change policy sensitivity or approval semantics.
- Change task persistence semantics.
- Change module enablement semantics.
- Remove or narrow public exports from `src/modules/index.ts` without an explicit breaking-change task.
- Force every module to have state folders, config defaults, config schemas, or one-file-per-command handlers.
- Make runtime CLI commands fail solely because README/agent-guide hygiene docs are missing.
- Hand-edit generated docs without identifying the canonical source and regeneration command.
- Batch-refactor multiple modules unless the task explicitly says to.

## Refactor principles

1. **Audit first.** Do not write standards based on assumptions.
2. **Pilot first.** Prove the standard on `skills` before enforcing it globally.
3. **Runtime and hygiene are different.** Runtime contracts belong in runtime code. Documentation/layout checks belong in scripts or generated inventories.
4. **Advisory before blocking.** New checks should start advisory or allowlisted, then tighten only after migration.
5. **Required means required. Optional means genuinely optional.** Do not create empty boilerplate files just to satisfy symmetry.
6. **Behavior preservation is part of done.** File movement is not complete until command behavior and public exports are verified.
7. **Generated docs must declare ownership.** Every generated section needs a canonical source and regeneration path.

## Desired end state

Every module should answer, without code search:

1. What does this module own?
2. What does it explicitly not own?
3. What commands does it expose?
4. What config does it read or contribute?
5. What state does it persist, if any?
6. How is it enabled or disabled?
7. What files must an agent read before modifying it?
8. What tests and docs must change with it?

## Minimal standard module shape

Required for every default registry module after migration:

```text
src/modules/<module-id>/
  README.md        # human/operator module overview
  AGENTS.md        # agent modification rules, pending naming confirmation in T-MOD-004
  index.ts         # public exports only, after migration
  module.ts        # WorkflowModule assembly only, after migration
  registration.ts  # ModuleRegistration metadata only, after migration
  config.md        # explanatory config contract
  instructions/    # command instruction markdown files
```

Optional, only when the module actually needs it:

```text
  commands/             # command dispatcher and handlers
  config.defaults.ts    # module-owned runtime defaults
  config.schema.json    # machine validation for module-owned config
  state/                # persistence schema/store/migration helpers
  types.ts              # module-local public types
  test-support.ts       # reusable module test helpers
```

The final standard must explicitly say which files are required, which are optional, and what evidence justifies omitting an optional file.

## Current known issues to verify

Verify these during T-MOD-000 rather than assuming they remain true:

- `src/modules/README.md` likely has stale dependency information.
- `approvals`, `planning`, and `improvement` likely have real dependencies not reflected in the README.
- `skills` and `plugins` likely have no module-level README yet.
- Multiple modules likely keep registration and command dispatch together in `index.ts`.
- Some modules return `unknown-command`; others may return `unsupported-command` for the same failure class.
- Config defaults are likely partly centralized in `src/core/workspace-kit-config.ts`.
- `context-activation` may be registered under `diagnostics` rather than a dedicated capability.
- `checkpoints` may have optional-peer semantics that need review against runtime behavior.

---

# Phase A — Baseline, decisions, and pilot

## T-MOD-000 — Audit current module reality

### Intent

Create the factual baseline. No code refactor should happen before this.

### Scope

Create:

- `docs/maintainers/MODULE-AUDIT.md`

Audit every module in `defaultRegistryModules`:

- `workspace-config`
- `documentation`
- `agent-behavior`
- `skills`
- `plugins`
- `subagents`
- `team-execution`
- `task-engine`
- `checkpoints`
- `context-activation`
- `approvals`
- `planning`
- `improvement`

### Required audit fields

For each module, record:

- module ID
- source folder
- registration location
- version
- capabilities
- `dependsOn`
- `optionalPeers`
- `enabledByDefault`
- command names
- instruction files
- README present/missing
- RULES present/missing
- AGENTS present/missing
- `config.md` present/missing
- config defaults location, if any
- config schema location, if any
- state/persistence ownership
- tests, if obvious
- command dispatch style
- public exports from `src/modules/index.ts`
- obvious doc drift
- obvious migration risk

### Acceptance criteria

- `docs/maintainers/MODULE-AUDIT.md` exists.
- The audit covers every module currently in `defaultRegistryModules`.
- The audit identifies dependency mismatches in `src/modules/README.md`, if present.
- The audit identifies public exports that must be preserved.
- The audit identifies modules with large inline command dispatch.
- The audit identifies modules using SQLite or other durable state.
- No runtime code changes are made.

### Dependencies

None.

---

## T-MOD-001 — Define the minimal module standard draft

### Intent

Write the first module standard as a draft based on the audit. Keep it minimal.

### Scope

Create or update:

- `.ai/module-standard.md` or the repo-approved AI-doc canonical path
- `docs/maintainers/MODULE-STANDARD.md`
- `docs/maintainers/module-build-guide.md`

### Acceptance criteria

- The standard identifies the canonical source and any generated outputs.
- The standard includes non-goals.
- The standard distinguishes required files from optional files.
- The standard does not require `config.defaults.ts`, `config.schema.json`, `state/`, `types.ts`, or one-file-per-command handlers for modules that do not need them.
- The standard describes `README.md` as human/operator documentation.
- The standard proposes or confirms the module-level agent guide filename, such as `AGENTS.md`.
- The standard describes `config.md` as explanatory documentation, not runtime config.
- The standard describes module enablement through `modules.enabled` and `modules.disabled`.
- The standard describes how to preserve public exports during refactors.

### Dependencies

- T-MOD-000.

---

## T-MOD-002 — Fix stale module dependency documentation

### Intent

Repair known doc drift before deeper refactoring.

### Scope

Update:

- `src/modules/README.md`

### Acceptance criteria

- Dependency and optional-peer information matches actual registrations.
- `approvals` is documented as depending on `task-engine` if confirmed by audit.
- `planning` is documented as depending on `task-engine` if confirmed by audit.
- `improvement` is documented as depending on `task-engine` and `planning` if confirmed by audit.
- `improvement` optional peer `documentation` is documented if confirmed by audit.
- `checkpoints` current optional-peer relationship with `task-engine` is documented, with a note that runtime semantics will be reviewed in T-MOD-012.
- The table includes `dependsOn` and `optionalPeers` columns.
- The table order matches `defaultRegistryModules`.
- The doc says registration metadata is the source of truth for dependencies.
- If the table is generated or should become generated later, mark that clearly.

### Dependencies

- T-MOD-000.

---

## T-MOD-003 — Pilot the standard on `skills`

### Intent

Prove the standard on one small module before enforcing it globally.

### Scope

Refactor only:

- `src/modules/skills/`

Possible changes, subject to the draft standard:

- add or standardize `README.md`
- add or standardize module-level agent guide
- split registration/module/index if useful
- add `commands/index.ts` if useful
- move skill discovery defaults only if config ownership is decided here or explicitly deferred

### Acceptance criteria

- Existing `skills` commands still work: `list-skills`, `inspect-skill`, `apply-skill`, `recommend-skills`.
- No command names change.
- No payload contracts change.
- No policy sensitivity changes.
- Public exports are preserved.
- README documents purpose, ownership, commands, config, state/audit behavior, dependencies, file layout, and safe extension points.
- Agent guide documents required files to read before modifying the module.
- Any file movement is behavior-preserving and covered by tests.
- Lessons learned are recorded in the module standard or audit follow-up section.

### Dependencies

- T-MOD-001.
- T-MOD-002 recommended.

---

## T-MOD-004 — Revise the module standard from the `skills` pilot

### Intent

Promote the draft standard into a practical standard after the pilot.

### Scope

Update:

- module standard docs
- module build guide
- this file if task order or definitions need adjustment

### Acceptance criteria

- The standard says whether `AGENTS.md` is confirmed as the module-level agent guide filename.
- The standard says whether `registration.ts` and `module.ts` are required for all modules or only for migrated modules.
- The standard says whether `commands/` is required for all command-capable modules or only when dispatch is non-trivial.
- The standard says when config defaults and config schemas are required.
- The standard says what remains advisory during migration.
- The standard says which checks may become blocking and when.

### Dependencies

- T-MOD-003.

---

# Phase B — Advisory tooling

## T-MOD-005 — Add advisory module layout checker

### Intent

Make drift visible without breaking the repo during migration.

### Scope

Create:

- `scripts/check-module-layout.mjs`

Update:

- `package.json`
- `pnpm run check` only if the checker can run in advisory/non-blocking mode first

### Acceptance criteria

- `pnpm run check-module-layout` exists.
- The checker identifies missing required docs or structure by module ID and path.
- The checker supports an explicit migration allowlist with rationale and task ID.
- The checker distinguishes required files from optional files.
- The checker does not make runtime CLI commands fail.
- If included in `pnpm run check`, it must not block until the migration allowlist is intentionally tightened.

### Dependencies

- T-MOD-004.

---

## T-MOD-006 — Add generated module inventory

### Intent

Give agents a stable module map when code search is unavailable.

### Scope

Create:

- `scripts/generate-module-inventory.mjs`
- `scripts/check-module-inventory.mjs`
- `src/modules/MODULES.generated.json`

Update:

- `src/modules/README.md`
- `package.json`

### Acceptance criteria

- Inventory is generated from actual module registrations and command manifest data.
- Inventory includes module ID, version, capabilities, dependencies, optional peers, enabled-by-default value, config doc path, instruction directory, command names, README path, and agent guide path when present.
- Inventory distinguishes missing optional files from missing required files.
- `check-module-inventory` can detect stale generated output.
- Generated output does not replace runtime registry validation.

### Dependencies

- T-MOD-005 recommended.

---

## T-MOD-007 — Standardize unknown-command responses

### Intent

Create one shared response helper for unknown module commands.

### Scope

Create:

- `src/core/module-command-result-helpers.ts`

Update at least one low-risk module or defer module adoption into migration tasks.

### Acceptance criteria

- Shared helper returns `code: "unknown-command"`.
- Helper includes module ID and command name in the message.
- At least one module uses the helper or a follow-up task is created to apply it module-by-module.
- Future module migration tasks include migration to the helper.
- Remaining `unsupported-command` use is documented as intentional or queued.

### Dependencies

None.

---

## T-MOD-008 — Add command manifest parity checks

### Intent

Keep builtin command manifest, module registrations, and instruction files aligned.

### Scope

Update or create checks around:

- `src/contracts/builtin-run-command-manifest.json`
- `src/contracts/builtin-run-command-manifest.ts`
- module registrations
- instruction directories

### Acceptance criteria

- Checks fail if a manifest command lacks a registered module.
- Checks fail if a manifest command lacks an instruction file.
- Checks fail if instruction file naming does not match command naming rules.
- Runtime handler parity is checked where practical; if not practical, the limitation is documented.
- Checks do not force one file per command.

### Dependencies

- T-MOD-006 recommended.

---

# Phase C — Config and runtime contract decisions

## T-MOD-009 — Decide where module development metadata belongs

### Intent

Decide whether docs/config metadata belongs in `ModuleRegistration`, separate metadata files, or generated conventions.

### Options

1. Extend `ModuleRegistration` with optional docs/config metadata.
2. Add `module.meta.json` or `module.meta.ts` per module.
3. Generate metadata from known paths and registrations without changing runtime types.

### Acceptance criteria

- Decision is recorded in an ADR or module standard section.
- Decision explicitly separates runtime validation from repository hygiene validation.
- If `ModuleRegistration` changes, the change is backward-compatible during migration.
- If metadata is separate, the checker consumes that metadata.

### Dependencies

- T-MOD-004.
- T-MOD-006 recommended.

---

## T-MOD-010 — Decide module config defaults ownership

### Intent

Decide how module-owned config defaults should be represented before moving defaults out of `src/core/workspace-kit-config.ts`.

### Acceptance criteria

- Decision says whether defaults live in `registration.configDefaults`, `config.defaults.ts`, or another metadata layer.
- Modules with no defaults are not forced to carry empty files unless the checker has a clear reason.
- Effective config layer order is documented.
- The decision includes migration steps for current `MODULE_CONFIG_CONTRIBUTIONS` entries.

### Dependencies

- T-MOD-009.

---

## T-MOD-011 — Pilot module-owned config defaults and schemas

### Intent

Pilot module-owned config defaults and optional schema validation on `skills` and `plugins`.

### Scope

Update only:

- `src/modules/skills/`
- `src/modules/plugins/`
- config resolution code as required by T-MOD-010
- tests for effective config behavior

### Acceptance criteria

- `skills.discoveryRoots` and `plugins.discoveryRoots` behavior remains compatible.
- Defaults are owned by the modules according to T-MOD-010.
- Schemas exist only if the decision requires them.
- Invalid module-scoped config is reported clearly.
- No other module is forced to add empty schema/default files.

### Dependencies

- T-MOD-010.
- T-MOD-003.

---

## T-MOD-012 — Review dependency and optional peer semantics

### Intent

Make module dependencies truthful and command peer requirements explicit.

### Scope

Review all default modules.

### Acceptance criteria

- Every `dependsOn` entry represents a true hard requirement.
- Every `optionalPeers` entry represents a true optional integration.
- Commands that require peers use command-level `requiresPeers` if module-level dependency is too broad.
- `checkpoints` dependency semantics are resolved or explicitly documented.
- Tests cover disabling required dependencies and peer-gated commands.
- `src/modules/README.md` and generated inventory reflect the decision.

### Dependencies

- T-MOD-002.
- T-MOD-006 recommended.

---

## T-MOD-013 — Decide dedicated `context-activation` capability

### Intent

Decide whether `context-activation` should have its own module capability instead of only using `diagnostics`.

### Acceptance criteria

- Decision is recorded.
- If accepted, `ModuleCapability` includes `context-activation`.
- If accepted, the context activation module declares the new capability.
- Inventory and docs reflect the decision.
- Tests pass.

### Dependencies

- T-MOD-006 recommended.

---

# Phase D — Module-by-module migration

## Migration rule for all module tasks

Every module migration must satisfy these cross-cutting criteria:

- One module per task unless explicitly stated.
- Behavior-preserving refactor only unless the task states otherwise.
- Public exports preserved or explicitly documented.
- Existing command names and payload contracts preserved.
- Policy sensitivity preserved.
- README and agent guide updated.
- State ownership documented.
- Config ownership documented.
- Unknown command handling moved to the shared helper when practical.
- Tests pass.
- The change can be reverted independently.

## T-MOD-014 — Migrate `skills` from pilot to final standard

### Acceptance criteria

- `skills` conforms to the final standard.
- `skills` remains the reference implementation for simple modules.
- Config and command dispatch match final decisions.

### Dependencies

- T-MOD-003.
- T-MOD-011 recommended.

---

## T-MOD-015 — Migrate `plugins`

### Acceptance criteria

- Existing commands still work: `list-plugins`, `inspect-plugin`, `install-plugin`, `enable-plugin`, `disable-plugin`.
- README documents plugin discovery, manifest validation, and SQLite enablement state.
- Agent guide documents policy-sensitive plugin mutations.
- Config ownership follows T-MOD-010/T-MOD-011.

### Dependencies

- T-MOD-011 recommended.
- T-MOD-014 recommended.

---

## T-MOD-016 — Extract shared SQLite-backed module helper

### Acceptance criteria

- Helper handles `TaskEngineError` consistently.
- Helper exposes `db`, planning store, and planning generation.
- Helper is proven by migrating at least two SQLite-backed modules.
- Helper does not hide module-specific transaction semantics.

### Dependencies

- T-MOD-015 recommended.

---

## T-MOD-017 — Migrate `subagents`

### Acceptance criteria

- Existing subagent commands still work.
- README documents subagent definitions, sessions, messages, and owned SQLite tables.
- Agent guide documents migration and state risks.
- Uses shared SQLite helper if T-MOD-016 has landed.

### Dependencies

- T-MOD-016 recommended.

---

## T-MOD-018 — Migrate `team-execution`

### Acceptance criteria

- Existing assignment and handoff commands still work.
- README documents assignment state and handoff/reconcile contracts.
- Agent guide documents state/migration risks.
- Uses shared SQLite helper if T-MOD-016 has landed.

### Dependencies

- T-MOD-016 recommended.
- T-MOD-017 recommended.

---

## T-MOD-019 — Migrate `context-activation`

### Acceptance criteria

- Existing CAE commands continue working.
- README documents registry, evaluation, shadow mode, traces, and enforcement boundaries.
- Agent guide documents files to read before changing registry or evaluation behavior.
- Capability decision from T-MOD-013 is applied if accepted.

### Dependencies

- T-MOD-013 recommended.

---

## T-MOD-020 — Migrate `checkpoints`

### Acceptance criteria

- Existing checkpoint commands still work.
- README documents git requirement, checkpoint persistence, destructive rewind risk, and task/planning dependency semantics.
- Agent guide documents rollback and destructive operation risks.
- Dependency semantics from T-MOD-012 are applied.

### Dependencies

- T-MOD-012.
- T-MOD-016 recommended.

---

## T-MOD-021 — Migrate `planning`

### Acceptance criteria

- Existing planning commands still work.
- README documents planning types, output modes, sessions, artifacts, wishlist/task output, and config rules.
- Agent guide documents artifact persistence and task-generation risks.
- Config defaults follow T-MOD-010.

### Dependencies

- T-MOD-010.

---

## T-MOD-022 — Migrate `agent-behavior`

### Acceptance criteria

- Existing behavior profile commands still work.
- README explains advisory-only behavior profile semantics.
- Agent guide states behavior profiles do not override policy or principles.
- Large inline command handling is reduced where practical.

### Dependencies

- T-MOD-007 recommended.

---

## T-MOD-023 — Migrate `improvement`

### Acceptance criteria

- Existing improvement commands still work.
- README documents transcript sync, archive paths, retry queue, recommendation tasks, scout report, and lineage behavior.
- Agent guide documents privacy/redaction and recommendation-generation risks.
- Dependencies match registration reality.

### Dependencies

- T-MOD-012 recommended.

---

## T-MOD-024 — Migrate `approvals`

### Acceptance criteria

- Existing approval commands still work.
- README documents task-engine dependency and review queue semantics.
- Agent guide documents policy-sensitive review behavior.
- Unknown command handling uses the shared helper.

### Dependencies

- T-MOD-007 recommended.
- T-MOD-012 recommended.

---

## T-MOD-025 — Migrate `documentation`

### Acceptance criteria

- Existing documentation commands still work.
- Existing README and RULES content is preserved or linked.
- Agent guide reconciles with existing `RULES.md`.
- Generated-doc source-of-truth and regeneration commands are explicit.

### Dependencies

- T-MOD-001.

---

## T-MOD-026 — Migrate `workspace-config`

### Acceptance criteria

- Existing config commands still work.
- README explains config layers and command responsibilities.
- Agent guide documents config mutation risks and generated docs requirements.
- Runtime config resolution remains in the appropriate core layer unless a separate design task changes it.

### Dependencies

- T-MOD-010 recommended.

---

## T-MOD-027 — Migrate `task-engine` last

### Acceptance criteria

- Existing task-engine commands still work.
- Public exports from `src/modules/index.ts` are preserved or explicitly documented.
- README remains comprehensive but follows the standard sections.
- Agent guide documents lifecycle, persistence, migration, and policy-sensitive risks.
- Refactor is behavior-preserving.
- Public API compatibility is checked before and after.

### Dependencies

- Most smaller module migrations should land first.

---

# Phase E — Final enforcement

## T-MOD-028 — Generate or refresh module docs from inventory where useful

### Acceptance criteria

- Generated sections are clearly marked.
- Canonical source and regeneration commands are documented.
- Checks fail when generated inventory or generated tables are stale.
- Hand-written docs explain meaning; generated docs carry fragile tables.

### Dependencies

- T-MOD-006.

---

## T-MOD-029 — Tighten module layout checker

### Acceptance criteria

- Migration allowlist is empty or every exception has an active task and rationale.
- Missing required module docs fail the check.
- Missing required instruction files fail the check.
- Generated inventory drift fails the check.
- Runtime CLI still does not fail solely because hygiene docs are missing.

### Dependencies

- T-MOD-005.
- T-MOD-014 through T-MOD-027.

---

## T-MOD-030 — Final module-refactor completion gate

### Acceptance criteria

- `pnpm run check` passes.
- `pnpm test` passes.
- Every default registry module has README and confirmed agent guidance.
- Every module has documented state ownership.
- Every module has documented config ownership.
- Dependency docs match registration reality.
- Public exports are preserved or documented.
- Command names and payload contracts are unchanged unless explicitly approved.
- Module inventory is current.
- This file is updated to mark the plan complete or archived into maintainer docs.

### Dependencies

- T-MOD-028.
- T-MOD-029.

---

# Recommended execution order

1. T-MOD-000 — Audit current module reality.
2. T-MOD-001 — Define minimal standard draft.
3. T-MOD-002 — Fix stale dependency docs.
4. T-MOD-003 — Pilot on `skills`.
5. T-MOD-004 — Revise standard from the pilot.
6. T-MOD-005 through T-MOD-008 — Add advisory tooling.
7. T-MOD-009 through T-MOD-013 — Make runtime/config decisions.
8. T-MOD-014 through T-MOD-027 — Migrate modules one at a time.
9. T-MOD-028 through T-MOD-030 — Generate docs, tighten checks, and close.

# What to do first

Start with T-MOD-000. Do not skip it. The audit is the input to every other task.

After T-MOD-000, make only the smallest safe doc fix from T-MOD-002 if the audit confirms the dependency drift. Then pilot `skills`.

# Coverage checklist

This plan covers:

- current-state audit before standardization
- explicit non-goals
- Composer-friendly first action
- pilot-first execution
- runtime-vs-hygiene separation
- generated-doc/source-of-truth awareness
- public API preservation
- config ownership without forcing empty files
- optional command-handler layouts
- module README and agent-guide standardization
- dependency/optional-peer review
- command manifest parity
- unknown-command consistency
- SQLite helper extraction after proving need
- per-module migration with behavior preservation
- final enforcement only after migration

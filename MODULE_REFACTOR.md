# MODULE_REFACTOR.md

## Purpose

This document is the safe execution plan for standardizing Workflow Cannon modules. It is intentionally **pilot-first** and **audit-first**. The goal is not to force every module into identical scaffolding; the goal is to make every module self-describing, easy for agents to modify safely, and mechanically checkable without breaking runtime behavior.

## Refactor principles

1. Preserve runtime behavior unless a task explicitly says otherwise.
2. Preserve public package exports unless a breaking-change task is approved.
3. Audit current module reality before writing standards.
4. Prove the pattern on one small module before enforcing it globally.
5. Separate runtime contracts from repository hygiene checks.
6. Keep module standards minimal unless tooling consumes the extra structure.
7. Do not make `workspace-kit run` fail because a README or agent guide is missing.
8. Prefer advisory checks during migration; tighten checks only after modules conform.
9. Make generated-doc ownership explicit before editing generated docs.
10. Change one module per refactor task unless the task is explicitly cross-cutting.

## Non-goals

These refactor tasks must not accidentally do any of the following:

- Rename shipped `workspace-kit run` commands.
- Change command behavior while moving files.
- Change policy sensitivity or approval semantics.
- Change task persistence semantics.
- Change module enablement semantics.
- Remove public exports from `src/modules/index.ts` without an explicit breaking-change task.
- Force all modules to have state folders, config defaults, config schemas, or one-file-per-command handlers when they do not need them.
- Convert documentation-only conventions into runtime failures.
- Hand-edit generated docs without identifying the canonical source and regeneration command.

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

Required for every default registry module:

```text
src/modules/<module-id>/
  README.md        # human/operator module overview
  AGENTS.md        # agent modification rules for this module, pending naming decision
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

The final standard must say which files are required, which are optional, and what evidence justifies omitting an optional file.

---

# Phase A — Baseline, decisions, and pilot

## T-MOD-000 — Audit current module reality

### Description

Generate a current-state inventory before changing standards or moving code. This prevents the refactor from being driven by assumptions.

### Goals

- Capture what modules actually declare and own today.
- Identify stale docs, missing READMEs, missing agent guidance, config ownership, state ownership, command dispatch style, and public exports.
- Produce a baseline that later checks can compare against.

### Scope

Create or update:

- `docs/maintainers/MODULE-AUDIT.md`

The audit must cover every module in the default registry:

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

### Acceptance criteria

- The audit lists each module ID, version, capabilities, `dependsOn`, `optionalPeers`, and `enabledByDefault`.
- The audit lists every shipped command per module.
- The audit lists whether README, RULES, AGENTS, config docs, instructions, config defaults, schemas, state files, and tests exist.
- The audit identifies stale documentation, especially dependency mismatches in `src/modules/README.md`.
- The audit identifies public exports from `src/modules/index.ts` that must be preserved.
- The audit identifies modules with large inline command dispatch.
- The audit identifies modules using SQLite or other durable state.
- No runtime code changes are made in this task.

### Dependencies

None.

---

## T-MOD-001 — Define the minimal module standard draft

### Description

Write the first version of the module standard as a **draft**, based on the audit. This draft should be intentionally minimal and should distinguish required conventions from optional conventions.

### Goals

- Define the smallest useful standard.
- Separate runtime contract requirements from repository hygiene requirements.
- Decide which standard elements are docs-only, CI-enforced, or runtime-enforced.

### Scope

Create or update:

- `.ai/module-standard.md` or the existing canonical AI-doc location selected by the repo rules
- `docs/maintainers/MODULE-STANDARD.md`
- `docs/maintainers/module-build-guide.md`

### Acceptance criteria

- The standard states its canonical source and regeneration/sync rules.
- The standard includes explicit non-goals.
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

### Description

Update `src/modules/README.md` so its module dependency table matches actual module registrations.

### Goals

- Restore trust in the module overview.
- Remove known stale dependency claims before deeper refactoring.

### Scope

Update:

- `src/modules/README.md`

### Acceptance criteria

- `approvals` is documented as depending on `task-engine`.
- `planning` is documented as depending on `task-engine`.
- `improvement` is documented as depending on `task-engine` and `planning`.
- `improvement` is documented as having optional peer `documentation`.
- `checkpoints` documents its current optional peer relationship with `task-engine`, with a note that runtime semantics will be reviewed in T-MOD-012.
- The table includes `dependsOn` and `optionalPeers` columns.
- The table order matches `defaultRegistryModules`.
- The doc says registration metadata is the source of truth for dependencies.
- If this table is generated or should be generated later, the doc marks it clearly.

### Dependencies

- T-MOD-000.

---

## T-MOD-003 — Pilot the standard on `skills`

### Description

Use the `skills` module as the first pilot for the standard. The pilot should prove the smallest useful module shape before changing contracts or enforcing checks globally.

### Goals

- Validate the draft standard on a small module.
- Preserve behavior while improving local organization and docs.
- Learn which proposed files are useful and which are ceremony.

### Scope

Refactor only:

- `src/modules/skills/`

Possible changes, subject to the draft standard:

- add or standardize `README.md`
- add or standardize module-level agent guide
- split registration/module/index if useful
- add `commands/index.ts` if useful
- move skill discovery defaults only if the config ownership decision is made in this task or explicitly deferred

### Acceptance criteria

- Existing `skills` commands still work: `list-skills`, `inspect-skill`, `apply-skill`, `recommend-skills`.
- No command names or payload contracts change.
- No policy sensitivity changes.
- Public exports are preserved.
- README documents purpose, ownership, commands, config, state/audit behavior, dependencies, file layout, and safe extension points.
- Agent guide documents required files to read before modifying the module.
- Any file movement is behavior-preserving and covered by tests.
- The task records lessons learned and updates the draft standard if needed.

### Dependencies

- T-MOD-001.
- T-MOD-002 recommended.

---

## T-MOD-004 — Revise the module standard from the `skills` pilot

### Description

Update the module standard based on the `skills` pilot. This task decides what becomes required, optional, advisory, or deferred.

### Goals

- Avoid enforcing an unproven abstraction.
- Convert lessons from the pilot into a durable standard.

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

# Phase B — Tooling and enforcement, advisory first

## T-MOD-005 — Add advisory module layout checker

### Description

Create a layout checker that reports deviations from the module standard without immediately blocking normal development.

### Goals

- Make drift visible.
- Avoid breaking the repo while modules are mid-migration.
- Prepare for final enforcement.

### Scope

Create:

- `scripts/check-module-layout.mjs`

Update:

- `package.json`
- `pnpm run check` only if the checker can run in advisory/non-blocking mode at first

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

### Description

Generate a compact machine-readable module inventory from actual registrations and command manifest data.

### Goals

- Give agents a stable map when code search is unavailable.
- Prevent stale hand-written module tables.
- Make module docs easier to verify.

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

### Description

Create a shared helper for unknown module commands and migrate modules gradually to a canonical response shape.

### Goals

- Make CLI behavior consistent.
- Reduce copy/paste error handling.
- Improve tests and agent remediation.

### Scope

Create:

- `src/core/module-command-result-helpers.ts`

Update modules opportunistically or in their own migration tasks.

### Acceptance criteria

- Shared helper returns `code: "unknown-command"`.
- Helper includes module ID and command name in the message.
- At least one module uses the helper.
- Future module migration tasks include migration to the helper.
- Any remaining `unsupported-command` use is documented as intentional or queued for migration.

### Dependencies

None.

---

## T-MOD-008 — Add command manifest parity checks

### Description

Enforce relationships between the builtin run command manifest, instruction files, and module command dispatch in a way that matches the standard.

### Goals

- Prevent manifest rows without instruction files.
- Prevent instruction entries that do not map to real files.
- Make command ownership obvious.

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

### Description

Decide whether docs/config metadata belongs directly in `ModuleRegistration` or in a separate development metadata file.

### Goals

- Avoid bloating runtime contracts with repository hygiene concerns.
- Make metadata machine-checkable either way.

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

### Description

Decide how module-owned config defaults should be represented before moving defaults out of `src/core/workspace-kit-config.ts`.

### Goals

- Make config ownership clearer.
- Avoid unnecessary files for modules with no config defaults.
- Preserve effective config behavior.

### Acceptance criteria

- Decision says whether defaults live in `registration.configDefaults`, `config.defaults.ts`, or another metadata layer.
- Modules with no defaults are not forced to carry empty files unless the checker has a clear reason.
- Effective config layer order is documented.
- The decision includes migration steps for current `MODULE_CONFIG_CONTRIBUTIONS` entries.

### Dependencies

- T-MOD-009.

---

## T-MOD-011 — Pilot module-owned config defaults and schemas

### Description

Pilot module-owned config defaults and optional schema validation on `skills` and `plugins`, because both have simple discovery-root config.

### Goals

- Prove config ownership without changing all modules at once.
- Validate module-scoped config files where useful.

### Scope

Update only:

- `src/modules/skills/`
- `src/modules/plugins/`
- config resolution code as required by T-MOD-010
- tests for effective config behavior

### Acceptance criteria

- `skills.discoveryRoots` and `plugins.discoveryRoots` behavior remains compatible.
- Defaults are owned by the modules according to the decision in T-MOD-010.
- Schemas exist only if the decision requires them.
- Invalid module-scoped config is reported clearly.
- No other module is forced to add empty schema/default files in this task.

### Dependencies

- T-MOD-010.
- T-MOD-003.

---

## T-MOD-012 — Review dependency and optional peer semantics

### Description

Review each module's `dependsOn`, `optionalPeers`, and command-level `requiresPeers` against runtime behavior.

### Goals

- Make dependency declarations truthful.
- Prevent runtime failures caused by disabled required modules.
- Clarify hard dependencies vs optional integrations.

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

## T-MOD-013 — Add dedicated `context-activation` capability if still warranted

### Description

Decide whether `context-activation` should have a dedicated module capability instead of only using `diagnostics`.

### Goals

- Make CAE discoverable in capability listings if it is a first-class capability.
- Avoid capability proliferation if `diagnostics` is sufficient.

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

Each module migration must satisfy these cross-cutting acceptance criteria:

- One module per task unless explicitly stated.
- Behavior-preserving refactor only unless the task states otherwise.
- Public exports preserved or explicitly documented.
- Existing commands, command names, and payload contracts preserved.
- Policy sensitivity preserved.
- README and agent guide updated.
- State ownership documented.
- Config ownership documented.
- Unknown command handling moved to the shared helper when practical.
- Tests pass.
- The change can be reverted independently.

## T-MOD-014 — Migrate `skills` from pilot to final standard

### Description

Finish any remaining `skills` cleanup after the pilot and config decisions.

### Acceptance criteria

- `skills` conforms to the final standard.
- `skills` remains the reference implementation for simple modules.
- Config and command dispatch match the final decisions.

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

### Description

Create a shared helper for modules that open planning SQLite, assert a module-specific schema, attach planning generation metadata, and handle storage errors consistently.

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

### Description

Migrate the central task-engine module only after smaller modules prove the pattern.

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

### Description

Use generated inventory to reduce stale hand-written module tables.

### Acceptance criteria

- Generated sections are clearly marked.
- Canonical source and regeneration commands are documented.
- Checks fail when generated inventory or generated tables are stale.
- Hand-written docs explain meaning; generated docs carry fragile tables.

### Dependencies

- T-MOD-006.

---

## T-MOD-029 — Tighten module layout checker

### Description

Turn advisory checks into blocking checks after all modules conform.

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

## T-MOD-030 — Add final module-refactor completion gate

### Description

Close the refactor by verifying standard conformance, behavior preservation, and public API compatibility.

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

# Coverage checklist

This revised plan covers:

- current-state audit before standardization
- explicit non-goals
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

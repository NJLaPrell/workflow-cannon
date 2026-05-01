# MODULE_REFACTOR.md

## Purpose

This document converts the module-standardization recommendations into an execution-ready task list. The goal is to make every Workflow Cannon module self-describing, consistently organized, safely modifiable by agents, and mechanically validated by repository checks.

## Desired end state

Every module should answer, without code search:

1. What does this module own?
2. What does it explicitly not own?
3. What commands does it expose?
4. What config does it read and contribute?
5. What state does it persist, if any?
6. How is it enabled or disabled?
7. What files must an agent read before modifying it?
8. What tests and docs must change with it?

The target shape for each module is:

```text
src/modules/<module-id>/
  README.md              # human/operator module overview
  AGENTS.md              # agent modification rules for this module
  index.ts               # public module exports only
  module.ts              # WorkflowModule assembly only
  registration.ts        # ModuleRegistration metadata only
  config.defaults.ts     # module-owned runtime default config
  config.schema.json     # module-owned config validation schema
  config.md              # human/agent config explanation
  instructions/          # command instruction markdown files
  commands/              # command handlers and dispatcher
  state/                 # optional persistence, schema, migrations
  types.ts               # module-local public types
  test-support.ts        # optional module test fixtures/helpers
```

Not every module needs `state/` or `test-support.ts`, but every module must explicitly document whether it owns state.

---

# Task list

## T-MOD-001 — Define the canonical module standard

### Description

Create a canonical module-standard document that defines the required layout, naming rules, ownership boundaries, command dispatch pattern, config pattern, state pattern, and agent modification expectations for every Workflow Cannon module.

This task should make the intended module shape explicit before any refactor begins.

### Goals

- Define one standard module layout.
- Define required and optional files.
- Define the difference between human docs, agent docs, runtime config, config schema, command instructions, and state ownership.
- Establish migration guidance for existing modules.

### Scope

Create or update:

- `.ai/module-standard.md`
- `docs/maintainers/MODULE-STANDARD.md`
- `docs/maintainers/module-build-guide.md`
- `src/modules/README.md`

### Acceptance criteria

- The standard lists all required files for a normal module.
- The standard describes when `state/` is required and when it may be omitted.
- The standard says `README.md` is for human/operator understanding.
- The standard says `AGENTS.md` is for agents modifying the module.
- The standard says `registration.ts` owns metadata only.
- The standard says `module.ts` assembles the `WorkflowModule` only.
- The standard says `index.ts` is a public export surface only.
- The standard says command logic belongs under `commands/`.
- The standard says runtime defaults belong in `config.defaults.ts`.
- The standard says config validation belongs in `config.schema.json`.
- The standard says `config.md` remains an explanatory config contract.
- The standard states how module enablement works through `modules.enabled` / `modules.disabled`.
- The standard is linked from `docs/maintainers/module-build-guide.md` and `src/modules/README.md`.

### Dependencies

None.

### Notes

This task should land before code movement so future refactors can point to one standard.

---

## T-MOD-002 — Fix stale module dependency documentation

### Description

Update `src/modules/README.md` so the shipped module table matches the actual `registration.dependsOn` and `registration.optionalPeers` values in code.

The current table incorrectly lists some modules as having no dependencies even though their registrations declare dependencies.

### Goals

- Restore trust in module documentation.
- Make the module overview reflect runtime reality.
- Prevent agents from relying on stale module dependency information.

### Scope

Update:

- `src/modules/README.md`

Review actual registrations for at least:

- `approvals`
- `planning`
- `improvement`
- `checkpoints`
- `context-activation`
- `task-engine`
- `skills`
- `plugins`
- `subagents`
- `team-execution`
- `workspace-config`
- `documentation`
- `agent-behavior`

### Acceptance criteria

- `approvals` is documented as depending on `task-engine`.
- `planning` is documented as depending on `task-engine`.
- `improvement` is documented as depending on `task-engine` and `planning`.
- `improvement` is documented as having optional peer `documentation`.
- `checkpoints` documents its optional peer relationship with `task-engine` or is changed later by a dedicated dependency task.
- The table includes both `dependsOn` and `optionalPeers` columns.
- The table order matches the default registry order.
- The doc says registration metadata is the source of truth for dependencies.

### Dependencies

- T-MOD-001 is recommended but not required.

### Notes

This is a small, high-value trust fix and should be done early.

---

## T-MOD-003 — Split module registry from public barrel exports

### Description

Move the default module registry out of `src/modules/index.ts` into a dedicated registry file so runtime registry membership is separate from public package exports.

Currently `src/modules/index.ts` both defines `defaultRegistryModules` and acts as a selective public export surface. Those are different responsibilities.

### Goals

- Make registry membership explicit and easy to inspect.
- Keep public package exports intentionally selective.
- Reduce confusion when a module is in the runtime registry but not re-exported as public API.

### Scope

Create:

- `src/modules/registry.ts`

Update:

- `src/modules/index.ts`
- CLI/config imports that currently import `defaultRegistryModules` from `src/modules/index.ts`
- relevant tests
- module build docs

### Acceptance criteria

- `src/modules/registry.ts` exports `defaultRegistryModules`.
- `src/modules/index.ts` re-exports `defaultRegistryModules` from `./registry.js` for backward compatibility unless a breaking-change decision is made.
- Public exports remain selective and documented.
- No runtime imports require public API barrel semantics just to get the registry.
- Existing tests pass.
- Docs explain that registry membership and package export support are different concepts.

### Dependencies

- T-MOD-001 recommended.

### Notes

Do not change module order as part of this task unless a test proves the current order is wrong.

---

## T-MOD-004 — Extend `ModuleRegistration` with docs and config contracts

### Description

Extend the module registration contract so each module can declare its README, agent guide, config defaults, and config schema in a consistent, machine-checkable way.

Current registration points to `config.md`, but runtime defaults and schema validation are not module-owned in the registration contract.

### Goals

- Make module self-description part of the formal contract.
- Allow checks to verify module docs and config files exist.
- Prepare for module-owned config default loading.

### Scope

Update:

- `src/contracts/module-contract.ts`
- `src/core/module-registry.ts`
- module registration objects
- tests covering module registration validation

Suggested contract extension:

```ts
export type ModuleRegistration = {
  id: string;
  version: string;
  contractVersion: "1";
  stateSchema: number;
  capabilities: ModuleCapability[];
  dependsOn: string[];
  optionalPeers?: string[];
  enabledByDefault: boolean;

  config: ModuleDocumentContract;
  configDefaults?: Record<string, unknown>;
  configSchema?: {
    path: string;
    format: "json-schema";
  };

  docs?: {
    readme: string;
    agentGuide: string;
  };

  instructions: ModuleInstructionContract;
};
```

### Acceptance criteria

- Registration supports optional `configDefaults`.
- Registration supports optional `configSchema`.
- Registration supports module docs metadata with README and agent guide paths.
- Module registry validation verifies declared docs and schemas exist when present.
- Existing modules continue to work during migration.
- The change is backward-compatible unless a deliberate breaking change is documented.

### Dependencies

- T-MOD-001.

### Notes

Make new fields optional first. A later task can make them required after all modules migrate.

---

## T-MOD-005 — Add a module layout checker

### Description

Create a repository check that validates module folder structure against the canonical standard.

This should prevent drift after the refactor by failing when modules are missing required docs, config, registration, command structure, or instruction files.

### Goals

- Enforce module consistency mechanically.
- Make module standards visible in CI.
- Catch missing README / AGENTS / config schema files early.

### Scope

Create:

- `scripts/check-module-layout.mjs`

Update:

- `package.json`
- `pnpm run check` pipeline
- tests or fixtures if needed

### Acceptance criteria

- `pnpm run check-module-layout` exists.
- `pnpm run check` invokes the module layout checker.
- The checker verifies each default registry module has a module folder.
- The checker verifies each module has `README.md`.
- The checker verifies each module has `AGENTS.md` once the migration phase requires it.
- The checker verifies each module has `config.md`.
- The checker verifies each module has an `instructions/` directory.
- The checker verifies declared instruction files exist and match command names.
- The checker can temporarily allow migration exceptions through an explicit allowlist with rationale.
- The checker output names the exact missing file and module ID.

### Dependencies

- T-MOD-001.
- T-MOD-004 recommended.

### Notes

Start with warn/allowlist mode if needed, then tighten after all modules conform.

---

## T-MOD-006 — Add generated module inventory

### Description

Generate a machine-readable module inventory from module registrations and the builtin run command manifest. This gives agents and maintainers a simple index even when code search is unavailable.

### Goals

- Make module discovery deterministic.
- Give agents a stable, compact view of modules, commands, docs, config, and enablement.
- Prevent stale hand-written module tables.

### Scope

Create:

- `scripts/generate-module-inventory.mjs`
- `scripts/check-module-inventory.mjs`
- `src/modules/MODULES.generated.json`

Update:

- `package.json`
- `pnpm run check`
- `src/modules/README.md`

Suggested JSON shape:

```json
{
  "schemaVersion": 1,
  "modules": [
    {
      "id": "skills",
      "enabledByDefault": true,
      "dependsOn": [],
      "optionalPeers": [],
      "capabilities": ["skills"],
      "readme": "src/modules/skills/README.md",
      "agentGuide": "src/modules/skills/AGENTS.md",
      "configDoc": "src/modules/skills/config.md",
      "configSchema": "src/modules/skills/config.schema.json",
      "instructionsDir": "src/modules/skills/instructions",
      "commands": ["list-skills", "inspect-skill", "apply-skill", "recommend-skills"]
    }
  ]
}
```

### Acceptance criteria

- Inventory is generated from actual module registrations, not hand-written duplication.
- Inventory includes module ID, version, capabilities, dependencies, optional peers, default enablement, docs, config doc, config schema, instructions directory, and commands.
- Inventory command list is derived from the builtin command manifest or registration instruction entries.
- `check-module-inventory` fails when the generated file is stale.
- `src/modules/README.md` links to the generated inventory.
- Agents can use the generated file as their first module map.

### Dependencies

- T-MOD-003 recommended.
- T-MOD-004 recommended.

---

## T-MOD-007 — Add per-module `README.md` files

### Description

Ensure every module has a human/operator README using the canonical module README template.

Some modules already have strong READMEs, such as `documentation` and `task-engine`; others are missing or not standardized.

### Goals

- Make every module understandable without reading implementation code.
- Create a consistent module documentation surface.
- Document boundaries and ownership explicitly.

### Scope

Add or standardize:

- `src/modules/workspace-config/README.md`
- `src/modules/documentation/README.md`
- `src/modules/agent-behavior/README.md`
- `src/modules/skills/README.md`
- `src/modules/plugins/README.md`
- `src/modules/subagents/README.md`
- `src/modules/team-execution/README.md`
- `src/modules/task-engine/README.md`
- `src/modules/checkpoints/README.md`
- `src/modules/context-activation/README.md`
- `src/modules/approvals/README.md`
- `src/modules/planning/README.md`
- `src/modules/improvement/README.md`

Required sections:

```md
# <Module Name> Module

## Purpose
## What this module owns
## What this module does not own
## Commands
## Config
## State and persistence
## Dependencies and optional peers
## File layout
## Safe extension points
```

### Acceptance criteria

- Every default registry module has a README.
- Every README includes the required sections.
- Every README lists module commands and points to instruction files.
- Every README documents whether the module owns persistent state.
- Every README documents dependencies and optional peers.
- Every README links to `AGENTS.md` for modification rules.
- Existing `documentation` and `task-engine` READMEs are updated without losing useful content.

### Dependencies

- T-MOD-001.
- T-MOD-002 recommended.

---

## T-MOD-008 — Add per-module `AGENTS.md` files

### Description

Add a module-level agent guide to every module. These files should tell agents how to safely modify the module and what must be updated with code changes.

### Goals

- Reduce agent ambiguity during module edits.
- Make local module rules explicit.
- Prevent agents from changing runtime behavior without updating docs, config, tests, and manifests.

### Scope

Add:

- `src/modules/<module-id>/AGENTS.md` for every default registry module.

Required sections:

```md
# Agent Rules for <module-id>

## Before editing
## Source-of-truth files
## Safe changes
## Dangerous changes
## Required tests
## Required docs updates
## Config changes
## State / migration changes
## Command changes
## Done criteria
```

### Acceptance criteria

- Every default registry module has `AGENTS.md`.
- Each `AGENTS.md` names the module's key implementation files.
- Each `AGENTS.md` names the command instruction files as required reading before command changes.
- Each `AGENTS.md` describes config update requirements.
- Each `AGENTS.md` describes state/migration requirements or explicitly says the module owns no state.
- Each `AGENTS.md` lists dangerous changes that require extra care.
- Documentation module's existing `RULES.md` is linked from or reconciled with `AGENTS.md`.

### Dependencies

- T-MOD-001.
- T-MOD-007 recommended.

---

## T-MOD-009 — Standardize module file split: `registration.ts`, `module.ts`, `index.ts`

### Description

Refactor modules so registration metadata, module assembly, and public exports live in separate files.

Current modules often place registration and command runtime together in `index.ts`. Task engine already has a split between export surface and internal module assembly, but the pattern is not universal.

### Goals

- Make metadata inspectable without reading runtime command logic.
- Make module assembly uniform.
- Make public exports intentional.

### Scope

For every module, converge on:

```text
registration.ts  # exports <moduleId>Registration
module.ts        # exports <moduleId>Module
index.ts         # public exports only
```

### Acceptance criteria

- Every module has `registration.ts`.
- Every module has `module.ts`.
- Every module's `index.ts` no longer contains large command dispatch logic.
- `index.ts` exports the module and selected stable types/helpers only.
- `module.ts` has no command implementation details beyond delegating to a dispatcher.
- Registrations remain identical in behavior after refactor.
- Existing tests pass.

### Dependencies

- T-MOD-003.
- T-MOD-007 and T-MOD-008 recommended.

### Suggested migration order

1. `context-activation`
2. `skills`
3. `plugins`
4. `subagents`
5. `team-execution`
6. `checkpoints`
7. `planning`
8. `agent-behavior`
9. `improvement`
10. `documentation`
11. `task-engine`

Leave `task-engine` for last because it is central and already has a special internal split.

---

## T-MOD-010 — Standardize command dispatch under `commands/`

### Description

Move module command handlers into a consistent `commands/` folder with a module-level dispatcher.

Current modules use different dispatch styles: some delegate to a handler, some have inline handler maps, and some use long `if` chains.

### Goals

- Make command handlers easy to locate.
- Reduce giant `index.ts` files.
- Make command testing easier.
- Make handler registration consistent across modules.

### Scope

For every module with commands, create:

```text
commands/
  index.ts
  <command-name>.ts
```

Where needed, command groups may be used:

```text
commands/profile-commands.ts
commands/session-commands.ts
```

### Acceptance criteria

- Every command-capable module has `commands/index.ts`.
- `module.ts` delegates to the command dispatcher.
- Each command handler is small enough to test independently or is grouped with clearly related commands.
- Unknown command handling uses the shared standard from T-MOD-011.
- Existing command behavior remains unchanged unless explicitly documented.
- Existing tests pass.

### Dependencies

- T-MOD-009.
- T-MOD-011 recommended.

---

## T-MOD-011 — Standardize unknown-command and unsupported-command responses

### Description

Create a shared helper for unknown module commands and migrate modules to use one canonical response code and message shape.

Current modules mix `unknown-command` and `unsupported-command` for the same class of failure.

### Goals

- Make CLI behavior consistent across modules.
- Make tests and agent remediation easier.
- Reduce copy/paste error handling.

### Scope

Create a shared helper such as:

- `src/core/module-command-result-helpers.ts`

Suggested helper:

```ts
export function unknownModuleCommand(moduleId: string, commandName: string): ModuleCommandResult {
  return {
    ok: false,
    code: "unknown-command",
    message: `${moduleId}: unknown command '${commandName}'`
  };
}
```

Update all modules to use the helper.

### Acceptance criteria

- Canonical code is `unknown-command`.
- All modules use the shared helper for unhandled command names.
- Tests cover at least one module unknown-command response.
- No module returns `unsupported-command` for an unknown command unless there is a documented semantic distinction.

### Dependencies

None.

---

## T-MOD-012 — Move module config defaults into module folders

### Description

Move static module-level config defaults out of `src/core/workspace-kit-config.ts` and into each module's own `config.defaults.ts`.

Current module config contributions are centralized in `MODULE_CONFIG_CONTRIBUTIONS`, and only some modules contribute defaults there.

### Goals

- Make config ownership local to the module.
- Remove central config default drift.
- Make adding module config straightforward.

### Scope

Create as needed:

- `src/modules/<module-id>/config.defaults.ts`

Update:

- `src/contracts/module-contract.ts`
- `src/core/workspace-kit-config.ts`
- all module registrations
- tests for config layer resolution

### Acceptance criteria

- `MODULE_CONFIG_CONTRIBUTIONS` is removed or reduced to a compatibility shim.
- Module defaults are declared by the module that owns them.
- `buildBaseConfigLayers()` reads config defaults from `mod.registration.configDefaults`.
- `planning` defaults are moved into `src/modules/planning/config.defaults.ts`.
- `skills` defaults are moved into `src/modules/skills/config.defaults.ts`.
- `plugins` defaults are moved into `src/modules/plugins/config.defaults.ts`.
- `approvals` explicitly declares empty or real defaults in its module folder.
- Effective config output remains behaviorally compatible.
- Tests prove module default layers still appear in registry startup order.

### Dependencies

- T-MOD-004.

---

## T-MOD-013 — Add module-owned config schemas

### Description

Add a JSON Schema file for each module's config domain and validate module-scoped config files against it.

The config system already loads module-scoped config files from `.workspace-kit/modules/<moduleId>/config.json`; this task makes validation module-owned and explicit.

### Goals

- Catch invalid module config early.
- Make module config contracts machine-readable.
- Align `config.md` documentation with runtime validation.

### Scope

Create:

- `src/modules/<module-id>/config.schema.json` for every module.

Update:

- module registrations
- config validation runtime
- doctor diagnostics
- tests

### Acceptance criteria

- Every module has `config.schema.json` or an explicit documented empty schema.
- Module-scoped config files are validated against the owning module schema.
- Module defaults are validated against the owning module schema.
- Doctor reports invalid module-scoped config with module ID and file path.
- Config schema docs link to `config.md`.
- Tests include valid and invalid module-scoped config examples.

### Dependencies

- T-MOD-004.
- T-MOD-012 recommended.

---

## T-MOD-014 — Clarify `config.md` vs runtime config responsibilities

### Description

Update module config docs and central config docs to clearly distinguish between runtime defaults, schema validation, and explanatory markdown.

### Goals

- Avoid treating `config.md` as runtime config.
- Make the config pipeline understandable to agents and maintainers.
- Document the config layer order.

### Scope

Update:

- `docs/maintainers/CONFIG.md` or its source generator
- `.ai/CONFIG.md` or its source generator
- `docs/maintainers/module-build-guide.md`
- each module's `config.md` as needed

### Acceptance criteria

- Docs state `config.defaults.ts` provides module runtime defaults.
- Docs state `config.schema.json` validates module-owned config.
- Docs state `config.md` explains config fields, examples, and operator meaning.
- Docs explain config layer order: kit default, module defaults, user, module-file, project, env, invocation.
- Docs mention `.workspace-kit/modules/<moduleId>/config.json` as module-scoped config.

### Dependencies

- T-MOD-012.
- T-MOD-013.

---

## T-MOD-015 — Add dedicated `context-activation` capability

### Description

Add a dedicated `context-activation` module capability and update the Context Activation module to use it.

Currently `context-activation` is registered with `diagnostics`, which hides its product identity in capability listings.

### Goals

- Make CAE visible as its own module capability.
- Improve module inventory clarity.
- Avoid overloading `diagnostics` as a catch-all capability.

### Scope

Update:

- `src/contracts/module-contract.ts`
- `src/modules/context-activation/registration.ts` or current module registration
- tests and docs that list capabilities

### Acceptance criteria

- `ModuleCapability` includes `context-activation`.
- `context-activation` module declares `capabilities: ["context-activation", "diagnostics"]` or another documented combination.
- Module inventory shows the dedicated capability.
- Tests pass.

### Dependencies

- T-MOD-004 recommended.

---

## T-MOD-016 — Extract shared SQLite-backed module helper

### Description

Create a shared helper for modules that open planning SQLite, assert a module-specific schema, attach planning-generation metadata, and perform transactions.

`subagents`, `team-execution`, `plugins`, and `checkpoints` currently repeat similar patterns.

### Goals

- Reduce duplicated SQLite boilerplate.
- Make stateful module command handlers smaller.
- Standardize storage error handling.
- Standardize planning-generation metadata attachment.

### Scope

Create:

- `src/core/module-sqlite-runtime.ts` or an equivalent shared location

Candidate helper:

```ts
withModuleSqlite(ctx, {
  moduleId: "subagents",
  assertSchema: assertSubagentKitSchema
}, async ({ db, planning, planningGeneration }) => {
  // command logic
});
```

Update at least:

- `subagents`
- `team-execution`
- `checkpoints`
- `plugins` where applicable

### Acceptance criteria

- Shared helper opens planning stores consistently.
- Shared helper handles `TaskEngineError` consistently.
- Shared helper validates module schema consistently.
- Shared helper exposes `db`, planning store, and planning generation.
- Shared helper can attach standard planning metadata or exposes a standard utility for doing so.
- At least two modules are migrated to prove the helper works.
- Existing tests pass.

### Dependencies

- T-MOD-010 recommended.

---

## T-MOD-017 — Re-evaluate module dependency and optional peer semantics

### Description

Review each module's `dependsOn` and `optionalPeers` declarations against runtime behavior. Update registrations or docs where runtime behavior effectively requires another module.

For example, `checkpoints` declares `task-engine` as an optional peer but opens planning stores and uses task-engine persistence helpers during command execution.

### Goals

- Make dependency declarations accurately reflect runtime requirements.
- Avoid enabled modules failing at runtime because a required peer is disabled.
- Clarify soft integrations vs hard dependencies.

### Scope

Review all default modules:

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

- Every `dependsOn` entry represents a true hard requirement.
- Every `optionalPeers` entry represents a true optional integration.
- If a command requires a peer but the module does not, that command uses `requiresPeers` in the command manifest.
- `checkpoints` either declares `task-engine` as a hard dependency or documents and enforces command-level peer requirements.
- Docs explain the difference between module dependency, optional peer, and command-level `requiresPeers`.
- Tests cover disabling required dependencies and command peer behavior.

### Dependencies

- T-MOD-002.
- T-MOD-006 recommended.

---

## T-MOD-018 — Add module template for future modules

### Description

Create a copyable module template that follows the canonical standard.

### Goals

- Make future modules start consistent.
- Reduce repeated design decisions.
- Provide a working reference for agents.

### Scope

Create:

- `src/modules/MODULE-TEMPLATE/README.md`
- `src/modules/MODULE-TEMPLATE/AGENTS.md`
- `src/modules/MODULE-TEMPLATE/index.ts.template`
- `src/modules/MODULE-TEMPLATE/module.ts.template`
- `src/modules/MODULE-TEMPLATE/registration.ts.template`
- `src/modules/MODULE-TEMPLATE/config.defaults.ts.template`
- `src/modules/MODULE-TEMPLATE/config.schema.json`
- `src/modules/MODULE-TEMPLATE/config.md`
- `src/modules/MODULE-TEMPLATE/instructions/example-command.md`
- `src/modules/MODULE-TEMPLATE/commands/index.ts.template`
- `src/modules/MODULE-TEMPLATE/commands/example-command.ts.template`

### Acceptance criteria

- Template compiles after replacing placeholders.
- Template includes command manifest update instructions.
- Template includes tests checklist.
- Template includes docs checklist.
- Template includes config schema and defaults examples.
- Template includes explicit state/no-state guidance.
- Module build guide links to the template.

### Dependencies

- T-MOD-001.
- T-MOD-009 recommended.
- T-MOD-010 recommended.

---

## T-MOD-019 — Standardize command manifest ownership rules

### Description

Document and enforce how module commands are declared in the builtin run command manifest and how that relates to instruction files and runtime handlers.

The builtin manifest is already the single source of truth for shipped `workspace-kit run` commands, but module folders should make the relationship obvious.

### Goals

- Prevent commands from existing in runtime but not manifest.
- Prevent manifest rows without instruction files or handlers.
- Make command ownership obvious per module.

### Scope

Update:

- `src/contracts/builtin-run-command-manifest.json`
- `src/contracts/builtin-run-command-manifest.ts`
- module standard docs
- checks validating manifest / instruction / handler parity

### Acceptance criteria

- Docs state that shipped run commands are declared in `builtin-run-command-manifest.json`.
- Docs state instruction file names must match command names.
- Checks fail if a manifest command lacks an instruction file.
- Checks fail if a manifest command lacks a registered module.
- Checks fail if a module instruction entry has no manifest row unless explicitly marked local/manual.
- Where feasible, checks fail if a command handler is missing from the module dispatcher.

### Dependencies

- T-MOD-005.
- T-MOD-010.

---

## T-MOD-020 — Standardize module state documentation and migration pattern

### Description

Define how modules declare whether they own persistent state, where that state lives, and how migrations are documented and tested.

### Goals

- Make state ownership clear per module.
- Avoid hidden coupling through the planning SQLite database.
- Standardize migration documentation.

### Scope

Update:

- module standard docs
- each module README
- each module AGENTS guide
- stateful module folders as needed

For stateful modules, converge on:

```text
state/
  schema.ts
  store.ts
  migrations.ts
```

Or document why the module uses an existing shared persistence area.

### Acceptance criteria

- Every module README has a `State and persistence` section.
- Every module AGENTS file has a `State / migration changes` section.
- Stateful modules identify tables/files they own.
- Stateless modules explicitly say they own no durable state.
- Modules using shared planning SQLite document the exact tables they own.
- Migration changes require tests and docs updates.
- State schema version guidance references `registration.stateSchema`.

### Dependencies

- T-MOD-007.
- T-MOD-008.
- T-MOD-016 recommended.

---

## T-MOD-021 — Refactor `skills` module to the new pattern

### Description

Use `skills` as the first small module migration to validate the new standard.

### Goals

- Prove the registration/module/commands/config/docs pattern on a small module.
- Keep behavior unchanged.
- Establish a reference implementation for other modules.

### Scope

Refactor:

- `src/modules/skills/`

Target files:

- `README.md`
- `AGENTS.md`
- `registration.ts`
- `module.ts`
- `index.ts`
- `config.defaults.ts`
- `config.schema.json`
- `commands/index.ts`
- individual command handlers or grouped command handlers

### Acceptance criteria

- `skills` module follows the target layout.
- Existing commands still work: `list-skills`, `inspect-skill`, `apply-skill`, `recommend-skills`.
- Skill discovery defaults are module-owned.
- Config schema covers `skills.discoveryRoots`.
- README and AGENTS describe no-state or audit behavior accurately.
- Tests pass.

### Dependencies

- T-MOD-009.
- T-MOD-010.
- T-MOD-012.
- T-MOD-013.

---

## T-MOD-022 — Refactor `plugins` module to the new pattern

### Description

Migrate the `plugins` module to the standard layout and config ownership model.

### Goals

- Standardize plugin module structure.
- Clarify plugin discovery vs plugin enablement state.
- Move plugin discovery defaults into the module.

### Scope

Refactor:

- `src/modules/plugins/`

### Acceptance criteria

- `plugins` module follows the target layout.
- Existing commands still work: `list-plugins`, `inspect-plugin`, `install-plugin`, `enable-plugin`, `disable-plugin`.
- `plugins.discoveryRoots` defaults live in `config.defaults.ts`.
- Config schema covers `plugins.discoveryRoots`.
- README documents plugin discovery, manifest validation, and SQLite enablement state.
- AGENTS documents policy-sensitive plugin mutations.
- Tests pass.

### Dependencies

- T-MOD-021 recommended as reference.

---

## T-MOD-023 — Refactor `subagents` module to the new pattern

### Description

Migrate the `subagents` module to the standard layout and shared SQLite helper pattern.

### Goals

- Standardize subagent module structure.
- Reduce repeated SQLite boilerplate.
- Clarify subagent definitions, sessions, and messages as module-owned state.

### Scope

Refactor:

- `src/modules/subagents/`

### Acceptance criteria

- `subagents` module follows the target layout.
- Existing commands still work: `list-subagents`, `get-subagent`, `list-subagent-sessions`, `get-subagent-session`, `register-subagent`, `retire-subagent`, `spawn-subagent`, `message-subagent`, `close-subagent-session`.
- README documents SQLite tables owned by the module.
- AGENTS documents state/migration requirements.
- Command handlers use shared SQLite helper if T-MOD-016 has landed.
- Tests pass.

### Dependencies

- T-MOD-016 recommended.
- T-MOD-021 recommended as reference.

---

## T-MOD-024 — Refactor `team-execution` module to the new pattern

### Description

Migrate the `team-execution` module to the standard layout and shared SQLite helper pattern.

### Goals

- Standardize team execution module structure.
- Clarify supervisor/worker assignment and handoff state ownership.
- Reduce duplicated planning SQLite handling.

### Scope

Refactor:

- `src/modules/team-execution/`

### Acceptance criteria

- `team-execution` module follows the target layout.
- Existing commands still work: `list-assignments`, `register-assignment`, `submit-assignment-handoff`, `block-assignment`, `reconcile-assignment`, `cancel-assignment`.
- README documents owned SQLite tables and handoff/reconcile contracts.
- AGENTS documents state/migration requirements.
- Command handlers use shared SQLite helper if T-MOD-016 has landed.
- Tests pass.

### Dependencies

- T-MOD-016 recommended.
- T-MOD-023 recommended as pattern for SQLite modules.

---

## T-MOD-025 — Refactor `context-activation` module to the new pattern

### Description

Migrate `context-activation` to the standard layout. This should be low-risk because it already delegates command dispatch cleanly.

### Goals

- Make CAE module structure consistent.
- Add README and AGENTS docs.
- Add dedicated capability if T-MOD-015 has landed.

### Scope

Refactor:

- `src/modules/context-activation/`

### Acceptance criteria

- `context-activation` module follows the target layout.
- Existing `cae-*` commands continue working.
- README explains CAE registry, evaluation, shadow mode, traces, and enforcement boundaries.
- AGENTS explains which CAE files must be read before modifying registry/evaluation behavior.
- Capability metadata is updated if T-MOD-015 has landed.
- Tests pass.

### Dependencies

- T-MOD-015 recommended.
- T-MOD-009.
- T-MOD-010.

---

## T-MOD-026 — Refactor `checkpoints` module to the new pattern

### Description

Migrate `checkpoints` to the standard layout and clarify its dependency relationship with task-engine/planning SQLite.

### Goals

- Standardize checkpoint module structure.
- Clarify git requirements and persistence requirements.
- Resolve or document task-engine optional peer behavior.

### Scope

Refactor:

- `src/modules/checkpoints/`

### Acceptance criteria

- `checkpoints` module follows the target layout.
- Existing commands still work: `list-checkpoints`, `compare-checkpoint`, `create-checkpoint`, `rewind-to-checkpoint`.
- README documents git repository requirement.
- README documents checkpoint SQLite state and owned tables.
- AGENTS documents destructive rewind risks and required tests.
- Dependency/optional peer semantics are resolved per T-MOD-017.
- Tests pass.

### Dependencies

- T-MOD-017.
- T-MOD-016 recommended.

---

## T-MOD-027 — Refactor `planning` module to the new pattern

### Description

Migrate `planning` to the standard module layout and move planning config defaults into the module folder.

### Goals

- Standardize a larger, workflow-heavy module.
- Clarify planning interviews, artifacts, wishlist/task output, and config rule packs.
- Move planning defaults out of core config.

### Scope

Refactor:

- `src/modules/planning/`

### Acceptance criteria

- `planning` module follows the target layout.
- Existing commands still work: `build-plan`, `list-planning-types`, `explain-planning-rules`.
- Planning defaults live in `config.defaults.ts`.
- Config schema covers planning depth, critical-unknown policy, adaptive finalize policy, and rule packs.
- README explains output modes and state/session behavior.
- AGENTS documents planning artifact and task persistence risks.
- Tests pass.

### Dependencies

- T-MOD-012.
- T-MOD-013.
- T-MOD-021 recommended as small-module reference.

---

## T-MOD-028 — Refactor `agent-behavior` module to the new pattern

### Description

Migrate `agent-behavior` to the standard module layout and split the large inline command implementation into command handlers.

### Goals

- Make behavior profile commands easier to maintain.
- Clarify advisory behavior vs policy authority.
- Document profile state ownership.

### Scope

Refactor:

- `src/modules/agent-behavior/`

### Acceptance criteria

- `agent-behavior` module follows the target layout.
- Existing behavior profile commands still work.
- README explains advisory-only behavior profile semantics.
- AGENTS warns that behavior profiles do not override policy or PRINCIPLES.
- Command handlers are split by command or logical group.
- Tests pass.

### Dependencies

- T-MOD-010.
- T-MOD-020 recommended.

---

## T-MOD-029 — Refactor `improvement` module to the new pattern

### Description

Migrate `improvement` to the standard layout and clarify transcript/recommendation/lineage state ownership.

### Goals

- Standardize improvement module structure.
- Clarify transcript sync vs recommendation generation vs lineage query boundaries.
- Document dependency on task-engine and planning.

### Scope

Refactor:

- `src/modules/improvement/`

### Acceptance criteria

- `improvement` module follows the target layout.
- Existing commands still work: `generate-recommendations`, `sync-transcripts`, `ingest-transcripts`, `transcript-automation-status`, `query-lineage`, `scout-report`.
- README documents transcript archive, retry queue, recommendation tasks, and lineage behavior.
- AGENTS documents privacy/redaction and recommendation-generation risks.
- Dependency docs match actual registration.
- Tests pass.

### Dependencies

- T-MOD-002.
- T-MOD-010.
- T-MOD-020 recommended.

---

## T-MOD-030 — Refactor `approvals` module to the new pattern

### Description

Migrate `approvals` to the standard layout and clarify its dependency on task-engine.

### Goals

- Standardize approvals module structure.
- Clarify approval queue and review decision semantics.
- Document policy-sensitive review behavior.

### Scope

Refactor:

- `src/modules/approvals/`

### Acceptance criteria

- `approvals` module follows the target layout.
- Existing commands still work: `list-approval-queue`, `review-item`.
- README documents task-engine dependency.
- AGENTS documents policy-sensitive review behavior.
- Unknown command handling uses standard helper.
- Tests pass.

### Dependencies

- T-MOD-002.
- T-MOD-011.

---

## T-MOD-031 — Refactor `documentation` module to the new pattern

### Description

Migrate `documentation` to the standard layout while preserving its existing README and RULES content.

### Goals

- Standardize documentation module structure.
- Preserve its strong existing docs.
- Reconcile `RULES.md` with the new `AGENTS.md` standard.

### Scope

Refactor:

- `src/modules/documentation/`

### Acceptance criteria

- `documentation` module follows the target layout.
- Existing commands still work: `document-project`, `generate-document`.
- Existing README content is preserved and reshaped into the standard sections.
- `AGENTS.md` links to or incorporates `RULES.md`.
- Documentation generation behavior is unchanged.
- Tests pass.

### Dependencies

- T-MOD-008.
- T-MOD-010.

---

## T-MOD-032 — Refactor `workspace-config` module to the new pattern

### Description

Migrate `workspace-config` to the standard layout and clarify its special role in config resolution.

### Goals

- Standardize workspace config module structure.
- Clarify that this module exposes config inspection/mutation commands but core config resolution remains in core.
- Document its relationship with agent guidance config.

### Scope

Refactor:

- `src/modules/workspace-config/`

### Acceptance criteria

- `workspace-config` module follows the target layout.
- Existing commands still work: `explain-config`, `resolve-config`, `resolve-agent-guidance`, `set-agent-guidance`.
- README explains config layers and command responsibilities.
- AGENTS documents config mutation risks and generated docs requirements.
- Tests pass.

### Dependencies

- T-MOD-014 recommended.

---

## T-MOD-033 — Refactor `task-engine` module to the new pattern

### Description

Migrate `task-engine` to the standard layout last, after smaller modules prove the pattern.

The task-engine module is central and already has a partial split between `index.ts` and `task-engine-internal.ts`. This task should adapt it to the standard without destabilizing command behavior.

### Goals

- Align the central module with the standard pattern.
- Preserve public exports intentionally.
- Keep command dispatch manageable.
- Document task lifecycle, persistence, state, migrations, and command boundaries.

### Scope

Refactor:

- `src/modules/task-engine/`

### Acceptance criteria

- `task-engine` module follows the target layout as far as practical.
- `registration.ts` owns registration metadata.
- `module.ts` assembles the WorkflowModule.
- `index.ts` remains a package-facing export surface.
- Existing task-engine commands continue working.
- Existing public exports are preserved or breaking changes are explicitly documented.
- README remains comprehensive but follows required sections.
- AGENTS documents lifecycle, persistence, migration, and policy-sensitive risks.
- Tests pass.

### Dependencies

- T-MOD-009.
- T-MOD-010.
- T-MOD-020.
- Smaller module refactors should land first.

---

## T-MOD-034 — Make module docs and inventory generated where possible

### Description

Reduce stale module documentation by generating shared module tables from registrations and command manifest data.

### Goals

- Prevent dependency table drift.
- Prevent command list drift.
- Keep human docs synced with code reality.

### Scope

Update generators or create a new one to refresh:

- `src/modules/README.md` shipped module table
- `src/modules/MODULES.generated.json`
- any maintainer module inventory docs

### Acceptance criteria

- Module dependency tables are generated from actual registrations.
- Command lists are generated from actual instruction entries / builtin manifest.
- Hand-written docs can add explanations but do not duplicate fragile tables without generation markers.
- `pnpm run check` fails when generated module docs are stale.

### Dependencies

- T-MOD-006.
- T-MOD-019.

---

## T-MOD-035 — Add module refactor completion gate

### Description

Add a final gate that validates every default module conforms to the new standard and remove temporary migration allowlists.

### Goals

- Complete the migration from recommendation to enforced standard.
- Ensure future modules cannot regress to the old mixed style.
- Make the module system self-describing and agent-ready.

### Scope

Update:

- `scripts/check-module-layout.mjs`
- `scripts/check-module-inventory.mjs`
- `pnpm run check`
- docs that mention temporary migration exceptions

### Acceptance criteria

- No module-standard migration allowlist remains, or every remaining exception has an explicit task and rationale.
- Every module has README and AGENTS files.
- Every module has registration/module/index split.
- Every module has config defaults and schema files, even if empty/no-op.
- Every command-capable module has command handlers under `commands/`.
- Generated module inventory is current.
- `src/modules/README.md` is current.
- Unknown command behavior is standardized.
- Dependency and optional peer docs match registration reality.
- `pnpm run check` passes.
- `pnpm test` passes.

### Dependencies

- T-MOD-001 through T-MOD-034.

---

# Recommended execution order

1. T-MOD-001 — Define the canonical module standard
2. T-MOD-002 — Fix stale module dependency documentation
3. T-MOD-003 — Split module registry from public barrel exports
4. T-MOD-004 — Extend `ModuleRegistration` with docs and config contracts
5. T-MOD-005 — Add a module layout checker
6. T-MOD-006 — Add generated module inventory
7. T-MOD-007 — Add per-module README files
8. T-MOD-008 — Add per-module AGENTS files
9. T-MOD-011 — Standardize unknown-command responses
10. T-MOD-012 — Move module config defaults into module folders
11. T-MOD-013 — Add module-owned config schemas
12. T-MOD-014 — Clarify config docs
13. T-MOD-015 — Add dedicated context-activation capability
14. T-MOD-016 — Extract shared SQLite-backed module helper
15. T-MOD-017 — Re-evaluate dependency and optional peer semantics
16. T-MOD-018 — Add module template
17. T-MOD-019 — Standardize command manifest ownership rules
18. T-MOD-020 — Standardize module state documentation and migrations
19. T-MOD-021 through T-MOD-033 — Refactor modules one by one
20. T-MOD-034 — Generate module docs and inventory where possible
21. T-MOD-035 — Add final completion gate

# Coverage checklist

This task list covers:

- module README standardization
- module AGENTS guide standardization
- config docs vs runtime config separation
- module-owned config defaults
- module-owned config schemas
- registry separation from public exports
- generated module inventory
- layout checking
- command manifest parity
- command handler layout
- unknown-command consistency
- state/migration documentation
- SQLite-backed module helper extraction
- dependency/optional-peer review
- context-activation capability cleanup
- stale `src/modules/README.md` dependency fix
- module-by-module migration plan
- final CI/check gate

# Module Build Guide

Human-readable companion to `.ai/module-build.md`.
If guidance conflicts, `.ai/module-build.md` is authoritative.

## Purpose

This guide defines how to build and evolve modules in Workflow Cannon with predictable behavior, explicit safety gates, and matching AI/human documentation outputs.

## Source-of-Truth Order

Use this precedence when sources disagree:

1. `.ai/` canonical docs
2. Code and config reality
3. Generated human docs
4. Narrative docs

## Module Build Contract

Every module change must satisfy these baseline rules:

- Implement `WorkflowModule` from `src/contracts/module-contract.ts`.
- Include `registration.id`, `registration.version`, `registration.contractVersion`, `registration.capabilities`, and `registration.dependsOn`.
- Include `registration.optionalPeers` when declaring soft module coupling (may be `[]`). Optional peers are not required to be enabled; `dependsOn` remains the hard requirement for enabled modules.
- Include `registration.enabledByDefault`.
- Include `registration.config`, `registration.instructions`, and monotonic **`registration.stateSchema`** (integer; versions persisted module state rows when using unified SQLite storage — see `WorkflowModule` / `ModuleRegistration` in `src/contracts/module-contract.ts`). There is **no** `registration.state` object on the TypeScript contract; do not document one.
- Keep dependencies explicit and valid for `ModuleRegistry` validation.
- If modules are toggled at runtime, ensure every enabled module keeps its required dependencies enabled.
- Workspace config (`modules.enabled` / `modules.disabled` in effective config) drives which modules are enabled for CLI `workspace-kit run` and related entrypoints; invalid module ids in config fail registry construction.
- Keep instruction entries aligned with real markdown instruction files.
- `ModuleRegistry` enforces instruction contract validity (name/file mapping and file existence).
- Use `src/core/module-command-router.ts` to list, resolve, and dispatch module commands for enabled modules.
- Use function-like instruction names and filename mapping:
  - `name`: command-style identifier (example: `document-project`)
  - `file`: markdown file in `instructions/` (example: `document-project.md`)
- Keep module behavior deterministic for supported inputs.
- Keep module boundaries clean:
  - modules can depend on `core` and `contracts`
  - modules should not directly import sibling modules

## Required Paths And Ownership

- `src/contracts/module-contract.ts`: canonical module contract types and interface.
- `src/core/module-registry.ts`: dependency validation and startup ordering.
- `src/core/module-command-router.ts`: enabled-module command discovery and dispatch.
- `src/modules/`: module implementations and registration metadata.
- `src/modules/index.ts` (**barrel**): exports `defaultRegistryModules` for CLI/config bootstrap and **selective** re-exports for integrators/tests (see **Barrel export policy** below).
- `src/modules/<module>/config.md`: module configuration contract.
- Unified module state is versioned by `registration.stateSchema` and persisted in SQLite.
- `src/modules/<module>/instructions/*.md`: function-like instruction files for module entrypoints.
- `src/modules/documentation/templates/*.md` (documentation module): document-type templates; the shipped set and `documentType` values are listed in `src/modules/documentation/instructions/document-project.md` (section **Inputs**) and mirrored in `src/modules/documentation/README.md`.
- `test/`: unit tests for module registration and behavior.
- `.ai/`: canonical AI docs for module build behavior.
- `docs/`: human-facing maintainer and workflow docs.

## Standard Workflow

### 1) Create module slice

- Define module scope and capability boundary.
- Add module under `src/modules/<module-name>/`.
- Implement `registration` and optional **`onCommand`** (the only runtime dispatch hook on `WorkflowModule` today). Older lifecycle-hook narratives are obsolete — do not document `onInstall` / `onEvent` style hooks unless reintroduced on the contract.
- Add `config.md` and instruction files.
- Wire instruction entries in registration (e.g. `document-project` -> `document-project.md`).
- Export module from index surfaces.

### 2) Validate behavior

- Add or update tests for:
  - registration validity
  - dependency behavior
  - enable/disable behavior and dependency integrity for enabled sets
  - instruction entry/path validity
  - primary command/event path
- Run:
  - `pnpm run test`
  - `pnpm run check`
- Resolve failures before moving on.

### 3) Publish docs

- Update `.ai/module-build.md` if module build behavior or constraints changed.
- Update this guide (and related maintainer docs) with the same decisions.
- Ensure docs describe where outputs live:
  - AI-optimized docs in `/.ai`
  - human-readable docs in configured `sources.humanRoot` (default: `docs/maintainers`)

### 4) Run gate review

Before merge or execution, confirm:

- Compatibility-impacting changes include migration notes.
- Release actions have explicit human approval.
- Migration/upgrade-path changes have explicit human approval.
- Policy/approval-model changes have explicit human approval.

Stop work when there is unapproved critical risk (irreversible data loss or critical secret risk).

## Barrel export policy (`src/modules/index.ts`)

- **`defaultRegistryModules`**: canonical ordered array consumed by CLI (`run-command`, `doctor-planning-issues`, `config-cli`, etc.). Adding a module belongs here.
- **Re-exports**: the barrel also exposes types and helpers for **package integrators, tests, and cross-package wiring** (for example `taskEngineModule`, `TaskStore`, documentation types). Not every module is re-exported symmetrically — that is intentional until a module has a stable external surface.
- **Rule**: add a barrel re-export only when (a) tests or `src/` entrypoints need it without deep imports, or (b) the symbol is part of the supported npm API. Otherwise import from `src/modules/<module>/index.js` directly inside the repo.
- **Changelog**: trimming or adding re-exports may impact npm consumers — note it in `docs/maintainers/CHANGELOG.md`.

## Definition Of Done

A module task is done only when all are true:

- Code: registration and behavior changes are implemented.
- Validation: tests and checks pass (`pnpm run test`, `pnpm run check`).
- Documentation: AI and human docs are updated and aligned.
- Evidence: task evidence and rationale are captured in project tracking docs.
- Gates: required human approvals are recorded when applicable.

## Minimal Starter Template

Use this as the minimum shape for a new module:

```typescript
import type { WorkflowModule } from "../../contracts/module-contract.js";

export const exampleModule: WorkflowModule = {
  registration: {
    id: "example",
    version: "0.1.0",
    contractVersion: "1",
    stateSchema: 1,
    capabilities: ["planning"],
    dependsOn: [],
    enabledByDefault: true,
    config: {
      path: "src/modules/example/config.md",
      format: "md"
    },
    instructions: {
      directory: "src/modules/example/instructions",
      entries: [
        {
          name: "example-run",
          file: "run.md"
        }
      ]
    }
  },
  async onCommand(command, ctx) {
    if (command.name === "example-run") {
      return { ok: true, code: "example-ran", data: { workspacePath: ctx.workspacePath } };
    }
    return { ok: false, code: "unsupported-command", message: `unknown command '${command.name}'` };
  }
};
```

## Guardrails

- Prefer small, reversible slices over broad rewrites.
- Do not bypass release, migration, or policy gates for speed.
- If requested work conflicts with principles, call it out and ask for confirmation before proceeding.

## Related References

- `.ai/PRINCIPLES.md`
- `docs/maintainers/PRINCIPLES.md`
- `src/README.md`
- `src/modules/README.md`
- `src/contracts/module-contract.ts`
- `src/core/module-registry.ts`
- `.workspace-kit/tasks/state.json`

- `docs/maintainers/RELEASING.md`

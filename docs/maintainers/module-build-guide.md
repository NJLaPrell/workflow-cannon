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
- Include `registration.enabledByDefault`.
- Include `registration.config`, `registration.state`, and `registration.instructions`.
- Keep dependencies explicit and valid for `ModuleRegistry` validation.
- If modules are toggled at runtime, ensure every enabled module keeps its required dependencies enabled.
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
- `src/modules/`: module implementations and registration metadata.
- `src/modules/<module>/config.md`: module configuration contract.
- `src/modules/<module>/state.md`: module state contract.
- `src/modules/<module>/instructions/*.md`: function-like instruction files for module entrypoints.
- `test/`: unit tests for module registration and behavior.
- `.ai/`: canonical AI docs for module build behavior.
- `docs/`: human-facing maintainer and workflow docs.

## Standard Workflow

### 1) Create module slice

- Define module scope and capability boundary.
- Add module under `src/modules/<module-name>/`.
- Implement `registration` and minimum required lifecycle hooks.
- Add `config.md`, `state.md`, and instruction files.
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
  - human-readable docs in `/docs`

### 4) Run gate review

Before merge or execution, confirm:

- Compatibility-impacting changes include migration notes.
- Release actions have explicit human approval.
- Migration/upgrade-path changes have explicit human approval.
- Policy/approval-model changes have explicit human approval.

Stop work when there is unapproved critical risk (irreversible data loss or critical secret risk).

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
    capabilities: ["planning"],
    dependsOn: [],
    enabledByDefault: true,
    config: {
      path: "src/modules/example/config.md",
      format: "md"
    },
    state: {
      path: "src/modules/example/state.md",
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
  async onStart() {
    // Keep startup deterministic and side effects explicit.
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
- `docs/maintainers/TASKS.md`
- `docs/maintainers/RELEASING.md`

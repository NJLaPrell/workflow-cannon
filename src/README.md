# Source Layout

Runtime code is organized by boundary, not by feature sprawl.

- `core/` — kernel services (policy, config resolution, command router, shared DB helpers, transcript hooks)
- `contracts/` — shared types and module contracts (`WorkflowModule`, instruction shapes)
- `modules/` — capability modules with `registration` + optional `onCommand`
- `adapters/` — external integration adapters (filesystem, sqlite, …)
- `ops/` — migration, doctor, and operational helpers

## Dependency rules (default)

- **`modules`** may depend on **`core`** and **`contracts`**.
- **`modules`** should **not** import sibling **`modules`** directly.
- **`adapters`** should not depend on **`modules`**; wiring happens from **`core`** / CLI.

## Maintainer-documented exceptions

Some **`core`** entrypoints intentionally import the **default module bundle** or re-export **module-owned implementations** so consumers have stable import paths:

- **`core/planning`** — facade over **task-engine** planning stores and types (planning **persistence** lives in task-engine; the **planning module** is the CLI interview surface). See **`docs/maintainers/ARCHITECTURE.md`**.
- **`core/config-cli`** — imports **`defaultRegistryModules`** from `src/modules/index.ts` to construct the registry used during config resolution.

For the full map, see **`docs/maintainers/ARCHITECTURE.md`**.

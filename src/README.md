# Source Layout

Runtime code is organized by boundary, not by feature sprawl.

- `core/` — kernel services (policy, config resolution, command router, shared DB helpers, transcript hooks)
- `contracts/` — shared types and module contracts (`WorkflowModule`, instruction shapes)
- `modules/` — capability modules with `registration` + optional `onCommand`
- `adapters/` — integration façade; kit SQLite `prepareKitSqliteDatabase` / `readKitSqliteUserVersion` are re-exported from `core/state/kit-sqlite` (see `adapters/index.ts`) alongside the adapter version marker.
- `ops/` — migration, doctor, and operational helpers

## Dependency rules (default)

- **`modules`** may depend on **`core`** and **`contracts`**.
- **`modules`** should **not** import sibling **`modules`** directly.
- **`adapters`** should not depend on **`modules`**; wiring happens from **`core`** / CLI.

## Maintainer-documented exceptions

**R102** in **`.ai/module-build.md`** requires modules to depend only on **`core`** and **`contracts`** and to avoid sibling-module imports. The following **`core`** entrypoints are **approved** exceptions: they import the **default module bundle** or re-export **module-owned** code so callers keep stable paths:

- **`core/planning`** — facade over **task-engine** planning stores and types (planning **persistence** lives in task-engine; the **planning module** is the CLI interview surface). See **`docs/maintainers/ARCHITECTURE.md`**.
- **`core/config-cli`** — imports **`defaultRegistryModules`** from `src/modules/index.ts` to construct the registry used during config resolution.
- **`core/skills/task-skill-validation`** — validates **`metadata.skillIds`** using **`modules/skills/discovery`** so **task-engine** does not import the **skills** module directly (REF-004).

For the full map, see **`docs/maintainers/ARCHITECTURE.md`**.

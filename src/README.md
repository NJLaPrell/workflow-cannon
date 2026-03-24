# Source Layout

Runtime code is organized by boundary, not by feature sprawl.

- `core/` - kernel services and runtime orchestration
- `contracts/` - shared types and contracts used across modules
- `modules/` - capability modules with explicit lifecycle hooks
- `adapters/` - external integration adapters (filesystem, sqlite, github, ai)
- `ops/` - migration, doctor, and operational helpers

Dependency rule:

- `modules` can depend on `core` and `contracts`.
- `modules` should not directly depend on other `modules`.
- `adapters` should not depend on `modules`; they are wired by `core`.

# Planning Module

CLI-native planning workflows for task breakdowns, sprint/phase planning, ordering, new features, and changes.

## Where state lives (read this first)

| State | Owner | On disk / API |
| --- | --- | --- |
| Execution tasks (`T###`), wishlist intake rows, transitions | **Task engine** (planning persistence) | Default **SQLite** `.workspace-kit/tasks/workspace-kit.db` (or JSON opt-out). Accessed through **`core/planning`** facades (`openPlanningStores`, `TaskStore`, …), not by importing deep `task-engine` paths from other modules. |
| In-flight **`build-plan`** answers / resume hint | **Planning module** + **`core/planning`** helpers | **`.workspace-kit/planning/build-plan-session.json`** (gitignored). Ephemeral UX/session mirror; durable promotion still goes through the task store. |
| Planning rules / interview definitions | **Planning module** | Code + config under `src/modules/planning/`; not the same as “planning persistence” in **TERMS**. |

For the system-level diagram and naming rules, see **`docs/maintainers/ARCHITECTURE.md`** → **Planning module vs planning persistence** and **`docs/maintainers/TERMS.md`** → **Planning module (CLI)** vs **Planning persistence (task engine)**.

## Current scope

- Typed workflow descriptors for supported planning types.
- Command surface:
  - `list-planning-types`
  - `build-plan` (Phase 17 scaffold response)

Later Phase 17 tasks add adaptive guided questioning, rule-driven flow defaults, hard critical-unknown gating, and wishlist artifact generation.

## Relationship to task-engine / persistence

**Naming:** “Planning module” here means this CLI module (`build-plan`, `planning.*` config). It is **not** the same as **planning persistence** (task-engine–owned `TaskStore` / SQLite / JSON task documents). That split is deliberate: the module owns **workflow UX**; the task engine owns **durable documents**.

This module emits planning output and may finalize artifacts into the **wishlist** via shared stores. **Persistence** (`TaskStore`, `WishlistStore`, `openPlanningStores`, SQLite) is owned by the **task-engine** module and re-exported through **`src/core/planning/`** for stable imports. See **`src/modules/task-engine/README.md`** and **Planning module (CLI)** vs **Planning persistence (task engine)** in **`docs/maintainers/TERMS.md`**.

**In-flight `build-plan` context** is mirrored to **`.workspace-kit/planning/build-plan-session.json`** (gitignored) for operator UIs: `workspace-kit run dashboard-summary` exposes a redacted **`planningSession`** object (no answer payload) for the Cursor extension dashboard.

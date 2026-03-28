# Planning Module

CLI-native planning workflows for task breakdowns, sprint/phase planning, ordering, new features, and changes.

## Current scope

- Typed workflow descriptors for supported planning types.
- Command surface:
  - `list-planning-types`
  - `build-plan` (Phase 17 scaffold response)

Later Phase 17 tasks add adaptive guided questioning, rule-driven flow defaults, hard critical-unknown gating, and wishlist artifact generation.

## Relationship to task-engine / persistence

This module emits planning output and may finalize artifacts into the **wishlist** via shared stores. **Persistence** (`TaskStore`, `WishlistStore`, `openPlanningStores`, SQLite) is owned by the **task-engine** module and re-exported through **`src/core/planning/`** for stable imports. See **`src/modules/task-engine/README.md`** and **Planning module vs planning persistence** in **`docs/maintainers/TERMS.md`**.

**In-flight `build-plan` context** is also mirrored to **`.workspace-kit/planning/build-plan-session.json`** (gitignored) for operator UIs: `workspace-kit run dashboard-summary` exposes a redacted **`planningSession`** object (no answer payload) for the Cursor extension dashboard.

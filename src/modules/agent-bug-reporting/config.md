# agent-bug-reporting module configuration

Scaffold module for agent-driven bug reporting (platform-agnostic reporter child → evidence-backed proposed improvement tasks).

## Dependencies

- **Required (`dependsOn`):** `task-engine`, `subagents`
- **Optional peers:** `skills`, `context-activation`, `approvals`

## Commands

No shipped manifest commands yet. Follow-on task **T100856** owns `file-bug-report`.

Until then, registration exposes a non-manifest overview instruction (`agent-bug-reporting-overview`) so the module appears in `list-commands` when enabled.

## Boundaries

Follow module-build **R100–R102**: no direct imports from sibling modules; use core/contracts and declared peers only.

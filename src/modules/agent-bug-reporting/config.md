# agent-bug-reporting module configuration

Module for agent-driven bug reporting (platform-agnostic reporter child → evidence-backed proposed improvement tasks).

## Dependencies

- **Required (`dependsOn`):** `task-engine`, `subagents`
- **Optional peers:** `skills`, `context-activation`, `approvals`

## Commands

- **`file-bug-report`** (Tier C / non-sensitive) — creates `type=improvement` `status=proposed` only; auto-fills `expectedPlanningGeneration` under policy `require`; supports `evidenceKey` / `clientMutationId` dedupe.

## Boundaries

Follow module-build **R100–R102**: prefer core/contracts; create path reuses task-engine mutation helpers declared via `dependsOn` (same as improvement/ideas).

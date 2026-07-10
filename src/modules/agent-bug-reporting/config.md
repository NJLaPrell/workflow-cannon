# agent-bug-reporting module configuration

Module for agent-driven bug reporting (platform-agnostic reporter child → evidence-backed proposed improvement tasks).

## Dependencies

- **Required (`dependsOn`):** `task-engine`, `subagents`
- **Optional peers:** `skills`, `context-activation`, `approvals`

## Commands

- **`file-bug-report`** (Tier C / non-sensitive) — creates `type=improvement` `status=proposed` only; auto-fills `expectedPlanningGeneration` under policy `require`; supports `evidenceKey` / `clientMutationId` dedupe.
- **`seed-wc-bug-reporter`** (Tier B / sensitive on apply) — preview or register the builtin `wc-bug-reporter` definition (`allowedCommands` centered on `file-bug-report`; metadata model pin `composer-2.5`).

## Host spawn adapters

Library under `src/modules/agent-bug-reporting/adapters/`:

| Host | Maturity | Notes |
| --- | --- | --- |
| Cursor | implemented | Background Task tool + handoff JSON |
| CLI | implemented | Direct `file-bug-report` (works without any IDE) |
| Antigravity | stub | Contract + CLI fallback |
| VS Code Copilot | stub | Contract + CLI fallback |

See `.ai/runbooks/bug-reporter-host-spawn.md`.

## Boundaries

Follow module-build **R100–R102**: prefer core/contracts; create path reuses task-engine mutation helpers declared via `dependsOn` (same as improvement/ideas). Seed apply writes through the subagents definition store.

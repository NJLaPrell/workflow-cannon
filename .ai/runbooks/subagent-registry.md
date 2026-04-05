# Subagent registry (operators)

## Purpose

Record **subagent definitions** and **session/message** provenance in kit SQLite while **Cursor (or another host)** runs the actual delegated agent. Workflow Cannon does **not** launch subagents from the CLI.

## Prerequisites

- Unified planning DB (default `.workspace-kit/tasks/workspace-kit.db`).
- `PRAGMA user_version` **≥ 6** (migrate by running any current `workspace-kit` against the workspace once).

## Typical flow

1. **Define** — `workspace-kit run register-subagent` with `subagentId`, `allowedCommands` (explicit command names), optional `displayName` / `description`. Use JSON `policyApproval` and `expectedPlanningGeneration` when your workspace requires them.
2. **Spawn (record)** — `workspace-kit run spawn-subagent` with `subagentId`, optional `executionTaskId` (`T###`), `hostHint` (e.g. `cursor`), `promptSummary`. Run the Cursor subagent in the product UI; this command only **persists** the session row.
3. **Handoff log** — `workspace-kit run message-subagent` with `sessionId`, `direction` (`outbound` | `inbound` | `system`), `body`.
4. **Close** — `workspace-kit run close-subagent-session` when the delegated work ends.
5. **Inspect** — `list-subagents`, `get-subagent`, `list-subagent-sessions`, `get-subagent-session`.

## Canon

- ADR: `docs/maintainers/adrs/ADR-subagent-registry-v1.md`
- Persistence map: `workspace-kit run get-kit-persistence-map '{}'`
- Policy: `docs/maintainers/POLICY-APPROVAL.md` — Tier B for mutating subagent commands.

# Subagent registry (operators)

## Purpose

Record **subagent definitions** and **session/message** provenance in kit SQLite while **Cursor (or another host)** runs the actual delegated agent. Workflow Cannon does **not** launch subagents from the CLI.

## Prerequisites

- Unified planning DB (default `.workspace-kit/tasks/workspace-kit.db`).
- `PRAGMA user_version` **≥ 6** (migrate by running any current `workspace-kit` against the workspace once).

## Typical flow

1. **Define** — `workspace-kit run register-subagent` with `subagentId`, `allowedCommands` (explicit command names), optional `displayName` / `description`. Use JSON `policyApproval` and `expectedPlanningGeneration` when your workspace requires them. For the builtin bug reporter, prefer `workspace-kit run seed-wc-bug-reporter` (see [`bug-reporter-host-spawn.md`](./bug-reporter-host-spawn.md)).
2. **Spawn (record)** — `workspace-kit run spawn-subagent` with `subagentId`, optional `executionTaskId` (`T###`), `hostHint` (e.g. `cursor`), `promptSummary`. Run the Cursor subagent in the product UI; this command only **persists** the session row.
3. **Handoff log** — `workspace-kit run message-subagent` with `sessionId`, `direction` (`outbound` | `inbound` | `system`), `body`.
4. **Close** — `workspace-kit run close-subagent-session` when the delegated work ends.
5. **Inspect** — `list-subagents`, `get-subagent`, `list-subagent-sessions`, `get-subagent-session`.

## Dashboard hygiene

The dashboard treats `status: "open"` subagent sessions as visible coordination rows in the agent activity / Active Agents card. Because the CLI only records provenance and does not launch or stop the external host, the operator or supervising agent must close the registry row whenever the real delegated agent ends, is abandoned, or is known not to be running.

Repair stale rows with the command path, not manual SQLite edits:

```bash
workspace-kit run list-subagent-sessions '{}'
workspace-kit run close-subagent-session '{"sessionId":"<uuid>","expectedPlanningGeneration":<n>,"policyApproval":{"confirmed":true,"rationale":"close stale subagent session; external agent is not active"}}'
```

When multiple stale rows exist, close them one at a time using the latest `planningGeneration` returned by the prior mutation or read.

## Canon

- ADR: `docs/maintainers/adrs/ADR-subagent-registry-v1.md`
- Persistence map: `workspace-kit run get-kit-persistence-map '{}'`
- Policy: `docs/maintainers/POLICY-APPROVAL.md` — Tier B for mutating subagent commands.

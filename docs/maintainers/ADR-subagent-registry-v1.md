# ADR: Subagent registry v1 (kit SQLite)

## Status

Accepted — shipped with kit SQLite `user_version` **6**.

## Context

Operators use **Cursor (and similar) subagents** for delegated work. Workflow Cannon must own **auditable, queryable records**—definitions, spawn provenance, and handoff messages—without pretending to launch remote agents from Node.

## Decision

1. **Storage:** Three relational tables in unified **`workspace-kit.db`**:
   - `kit_subagent_definitions` — id, display name, description, `allowed_commands_json` (explicit `workspace-kit run` names; **no** wildcards), `retired`, optional `metadata_json`, timestamps.
   - `kit_subagent_sessions` — session id, `definition_id`, optional `execution_task_id` (`T###`), `status` (`open` | `closed`), `host_hint`, `metadata_json`, timestamps.
   - `kit_subagent_messages` — append-only log: `session_id`, `direction` (`outbound` | `inbound` | `system`), `body`, `created_at`.

2. **Module:** `subagents` with read commands (`list-*`, `get-*`) and mutating commands (`register-subagent`, `retire-subagent`, `spawn-subagent`, `message-subagent`, `close-subagent-session`) gated as **`subagents.persist`** (Tier B: JSON `policyApproval` + planning generation when required).

3. **Non-goals (v1):** Invoking Cursor APIs from `workspace-kit`; automatic permission enforcement against `allowedCommands` at runtime (values are **declared intent** for operators and future policy); cross-repo subagent federation.

## Consequences

- **Migrations:** Opening the DB with a current `workspace-kit` applies DDL when `user_version < 6`.
- **Consumers:** Use `get-kit-persistence-map` for table names; use CLI for CRUD and session logs.
- **Follow-ups:** Tighten validation hooks; supervisor assignment model ships as **ADR-team-execution-v1.md** (`user_version` 7); optional enforcement when spawning.

## References

- Runbook: `docs/maintainers/runbooks/subagent-registry.md`
- Code: `src/core/state/workspace-kit-sqlite.ts`, `src/modules/subagents/`

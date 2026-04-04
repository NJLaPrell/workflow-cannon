# ADR: Team execution v1 (supervisor / worker assignments)

## Status

Accepted — shipped with kit SQLite `user_version` **7**.

## Context

Phase **57** shipped **subagent registry** rows for delegated work. Operators still need **explicit supervisor-led assignments** over **execution tasks** (`T###`): who owns supervision, which worker is responsible, what **handoff** they produced, and what **reconcile checkpoint** the supervisor recorded **before** lifecycle transitions (e.g. `run-transition` **complete**) are treated as trustworthy.

## Decision

1. **Storage:** Table **`kit_team_assignments`** in unified **`workspace-kit.db`**:
   - **`id`** (primary key), **`execution_task_id`** (logical FK to **`task_engine_tasks.id`**; enforced at write time),
   - **`supervisor_id`**, **`worker_id`** (opaque strings — email, handle, or machine id),
   - **`status`**: `assigned` | `submitted` | `blocked` | `reconciled` | `cancelled`,
   - **`handoff_json`** (worker payload, validated **v1** on submit),
   - **`reconcile_checkpoint_json`** (supervisor payload, validated **v1** on reconcile),
   - **`block_reason`**, **`metadata_json`**, **`created_at`**, **`updated_at`**.

2. **Handoff contract v1 (worker → submitted):** JSON object with **`schemaVersion`: `1`**, non-empty **`summary`**, optional **`evidenceRefs`** (string array). Unknown top-level keys are preserved in storage but not interpreted in v1.

3. **Reconcile checkpoint v1 (supervisor → reconciled):** JSON object with **`schemaVersion`: `1`**, non-empty **`mergedSummary`**.

4. **Module:** **`team-execution`** — read **`list-assignments`**; mutating commands (**`register-assignment`**, **`submit-assignment-handoff`**, **`block-assignment`**, **`reconcile-assignment`**, **`cancel-assignment`**) are Tier **B** with **`team-execution.persist`** (JSON **`policyApproval`** + planning generation when required).

5. **Non-goals (v1):** Remote worker processes launched from Node; automatic enforcement that workers only run allowed commands; UI for assignments; **`get-next-actions`** surfacing of assignment queues (**deferred** — see runbook **§ Integration gap**).

## Consequences

- **Migrations:** Opening the DB with a current **`workspace-kit`** applies DDL when `user_version < 7`.
- **Consumers:** Use **`get-kit-persistence-map`** → **`teamExecution`** for table name and minimum version.
- **Team vs single-agent:** Single-agent path is unchanged. Team path **adds** persisted evidence; it does not replace **`run-transition`** or policy gates.

## References

- Depends on relational **`task_engine_tasks`** (Phase **57** / **56** queue prerequisites).
- Runbook: `docs/maintainers/runbooks/team-execution-supervisor.md`
- Subagent ADR (delegation provenance): `docs/maintainers/ADR-subagent-registry-v1.md`
- Code: `src/core/state/workspace-kit-sqlite.ts`, `src/modules/team-execution/`

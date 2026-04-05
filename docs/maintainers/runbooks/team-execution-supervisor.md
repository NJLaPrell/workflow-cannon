# Team execution supervisor runbook (v1)

Supervisor-led runs use **`team-execution`** CLI commands plus the normal **task engine** lifecycle. The kit **does not** start workers; it **persists** assignment + handoff + reconcile rows for audit and operator discipline.

## Prerequisites

- Kit SQLite **`user_version` ≥ 7** (run **`pnpm run wk doctor`** once after upgrading).
- Execution task id (**`T###`**) exists in **`task_engine_tasks`** (relational store).
- Mutating commands: JSON **`policyApproval`** in the third CLI argument; **`expectedPlanningGeneration`** when **`tasks.planningGenerationPolicy`** is **`require`**.

## Operator flow

1. **Supervisor** — register an assignment:

   ```bash
   pnpm run wk run register-assignment '{"executionTaskId":"T665","supervisorId":"<you>","workerId":"<worker>","policyApproval":{"confirmed":true,"rationale":"team run"}}'
   ```

2. **Worker** — do the work in the host (Cursor, terminal, etc.); when ready, submit handoff **v1**:

   ```bash
   pnpm run wk run submit-assignment-handoff '{"assignmentId":"<id>","workerId":"<worker>","handoff":{"schemaVersion":1,"summary":"…","evidenceRefs":[]},"policyApproval":{"confirmed":true,"rationale":"handoff"}}'
   ```

3. **Supervisor** — reconcile (merge decision) or block/cancel as needed:

   ```bash
   pnpm run wk run reconcile-assignment '{"assignmentId":"<id>","supervisorId":"<you>","checkpoint":{"schemaVersion":1,"mergedSummary":"…"},"policyApproval":{"confirmed":true,"rationale":"reconcile"}}'
   ```

4. **Lifecycle** — only after evidence exists in kit (handoff + reconcile, or documented cancel/block reason), run **`run-transition`** / queue rules as today. Chat-only claims **do not** replace persisted rows.

5. **Inspect** — `list-assignments` with optional filters (`executionTaskId`, `status`, `supervisorId`, `workerId`).

## Integration gap (explicit)

**`get-next-actions`** does **not** yet include assignment-backed suggestions in **v0.58.0**. Operators use **`list-assignments`** + task queue side by side. Follow-up: product issue or phase task to merge assignment hints into **`get-next-actions`** without breaking JSON consumers.

## Related docs

- ADR: `docs/maintainers/adrs/ADR-team-execution-v1.md`
- Tier table: `docs/maintainers/AGENT-CLI-MAP.md` (**`team-execution.persist`**)
- Persistence map: `pnpm run wk run get-kit-persistence-map '{}'`

<!--
agentCapsule|v=1|command=create-task|module=task-engine|schema_only=pnpm exec wk run create-task --schema-only '{}'
-->

# create-task

Create a task record through the Task Engine persistence path.

## Usage

The id is optional. Omit it and the server allocates the next `T###` automatically:

```
workspace-kit run create-task '{"title":"My task","status":"proposed"}'
```

Pass an explicit `id` only when you need a specific one (e.g. deterministic imports):

```
workspace-kit run create-task '{"id":"T400","title":"My task","status":"proposed"}'
```

## Arguments

<!-- workspace-kit:generated task-engine-instruction-contract command=create-task section=args start -->
| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `title` | `string` | yes | Task title. |
| `id` | `string` | no | Task id. |
| `allocateId` | `boolean` | no | Legacy opt-in for server-side id allocation. Optional — allocation is the default when `id` is omitted. Cannot combine with an explicit `T###` id. |
| `dryRun` | `boolean` | no | Command argument. |
| `status` | string (`proposed`, `ready`) | no | Initial task status. |
| `clientMutationId` | `string` | no | Retry/idempotency key. |
| `expectedPlanningGeneration` | `integer` or `string` | no | Optimistic concurrency token from a prior read response. |
| `actor` | `string` | no | Actor recorded on transition evidence or task mutation metadata. |
| `config` | `object` | no | Invocation-local config override. |
<!-- workspace-kit:generated task-engine-instruction-contract command=create-task section=args end -->

**Id allocation:** `id` is optional. When omitted (or set to the `"auto"` sentinel), the server allocates the next `T###` id automatically — you do **not** need to pass `allocateId:true`. Provide an explicit `T###` `id` only when you need a specific one (e.g. deterministic imports); an explicit id cannot be combined with `allocateId:true`.

The schema permits additional task fields; common fields include `type`, `priority`, `dependsOn`, `unblocks`, `phase`, `phaseKey`, `metadata`, `ownership`, `approach`, `summary`, `description`, `risk`, `technicalScope`, `acceptanceCriteria`, and `features` (taxonomy slugs from `feature-taxonomy.json`; unknown slugs produce advisory warnings).

**Intake preview (read-only):** run **`workspace-kit run resolve-task-intake-policy`** with the same `type` / `status` / `metadata` shape you plan to persist, or use **`get-next-actions`** / **`agent-bootstrap`** / **`list-tasks`** with **`includeTaskIntake:true`** for compact field-gap hints — see `resolve-task-intake-policy.md`.

**`tasks.intakePolicy` + `status: "ready"`:** when workspace config sets **`tasks.intakePolicy.enforcementMode`** to **`enforce`**, the resolver can select the context profile **`workspace-kit-create-ready`** for **`type: "workspace-kit"`** + **`create-ready`**. Incomplete **`summary`**, **`technicalScope`**, or **`acceptanceCriteria`** then fail **`create-task`** with **`task-intake-blocked`**. Draft creates with **`status: "proposed"`** remain permissive for the same type (enforcement applies to **`create-ready`**, not **`create-proposed`**). Preflight with **`resolve-task-intake-policy`** using **`action":"create-ready"`** and **`targetStatus":"ready"`** before mutating.

Known type guardrails:

- For `type: "improvement"`, Task Engine validates non-empty `acceptanceCriteria` and `technicalScope`, plus non-empty **`metadata.issue`** (problem statement) and **`metadata.supportingReasoning`** (why this is the issue; cite evidence refs). Legacy rows whose id matches **`imp-<hex>`** may omit **`metadata.supportingReasoning`** until updated.
- Violations return stable error code `invalid-task-type-requirements`.

Idempotency behavior:

- Reusing the same `clientMutationId` with the same payload returns a replay success (`task-create-idempotent-replay`).
- Reusing the same `clientMutationId` with a different payload returns `idempotency-key-conflict`.

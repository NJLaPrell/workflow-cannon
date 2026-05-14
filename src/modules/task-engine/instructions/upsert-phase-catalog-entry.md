<!--
agentCapsule|v=1|command=upsert-phase-catalog-entry|module=task-engine|schema_only=pnpm exec wk run upsert-phase-catalog-entry --schema-only '{}'
-->

# upsert-phase-catalog-entry

Create or update **`kit_phase_catalog`** for a **`phaseKey`** with optional **`shortDescription`** (single line, max 240 chars). Omitted **`shortDescription`** preserves the existing description when the row already exists; otherwise stores **`null`**.

Optional **`actor`** is recorded in mutation evidence for audit trails.

Optional **`clientMutationId`** enables idempotent replay: same payload returns **`phase-catalog-entry-upsert-idempotent-replay`** (or remove replay variant), while reused id with a different payload returns **`idempotency-key-conflict`**.

**`remove`:** when **`true`**, deletes the catalog row for **`phaseKey`** (does not change workspace current/next phase).

Numeric **`phaseKey`s** whose leading ordinal sorts **strictly before** the workspace current kit phase are rejected (**`phase-target-before-current-workspace-phase`**) — same ladder rule as **`assign-task-phase`**.

When **`tasks.planningGenerationPolicy`** is **`require`**, pass **`expectedPlanningGeneration`** from a prior read (**`list-tasks`**, **`phase-status`**, **`list-phase-catalog`**, etc.).

## Usage

```
pnpm exec wk run upsert-phase-catalog-entry '{"phaseKey":"90","shortDescription":"Init UX follow-ups","expectedPlanningGeneration":123}'
pnpm exec wk run upsert-phase-catalog-entry '{"phaseKey":"90","shortDescription":null,"expectedPlanningGeneration":124}'
pnpm exec wk run upsert-phase-catalog-entry '{"phaseKey":"90","remove":true,"expectedPlanningGeneration":125}'
pnpm exec wk run upsert-phase-catalog-entry '{"phaseKey":"90","shortDescription":"Init UX follow-ups","actor":"cursor-dashboard","clientMutationId":"phase-90-deliverables-v1","expectedPlanningGeneration":126}'
```

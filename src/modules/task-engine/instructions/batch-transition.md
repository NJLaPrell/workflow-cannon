<!--
agentCapsule|v=1|command=batch-transition|module=task-engine|schema_only=pnpm exec wk run batch-transition --schema-only '{}'
-->

# batch-transition

Preview or apply multiple `run-transition` operations with shared guards and planning-generation checks.

## Usage

Dry-run (default):

```
pnpm exec wk run batch-transition '{"dryRun":true,"transitions":[{"taskId":"T400","action":"start"},{"taskId":"T401","action":"demote"}],"policyApproval":{"confirmed":true,"rationale":"triage preview"}}'
```

Apply when preview is clean:

```
pnpm exec wk run batch-transition '{"apply":true,"transitions":[{"taskId":"T400","action":"start"}],"expectedPlanningGeneration":1,"policyApproval":{"confirmed":true,"rationale":"apply batch"}}'
```

## Arguments

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `transitions` | `{ taskId, action, clientMutationId? }[]` | yes | Ordered transition specs (same actions as `run-transition`). |
| `dryRun` | `boolean` | no | Default **true** when `apply` is not true. Validates without persisting. |
| `apply` | `boolean` | no | When **true**, applies all transitions after validation (requires all to pass). |
| `expectedPlanningGeneration` | `integer` or `string` | no | Required when policy is `require` and `apply` is true. |
| `actor` | `string` | no | Actor on transition evidence. |
| `policyApproval` | `object` | yes (policy) | JSON approval on the run argv object. |

## Returns

- **`batch-transition-dry-run`** — `data.results[]` per transition with `allowed`, `guardResults`, `fromState`, `toState`.
- **`batch-transition-applied`** — `data.evidence[]` transition evidence rows when `apply:true`.
- **`batch-transition-blocked`** — apply refused because validation failed (see `data.results`).

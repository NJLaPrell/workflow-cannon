<!--
agentCapsule|v=1|command=append-wbs-row|module=planning|schema_only=pnpm exec wk run append-wbs-row --schema-only '{}'
-->

# append-wbs-row

Append **one** schema-valid WBS row to the latest **unified IdeaPlan** draft in `planning` status without resubmitting the full PlanArtifact JSON body.

**Tier:** B (mutation — requires JSON `policyApproval` and `expectedPlanningGeneration` when policy is `require`).

## Usage

```bash
pnpm exec wk run append-wbs-row '{"planRef":"plan-artifact:<planId>","wbsRow":{...},"expectedPlanningGeneration":<n>,"policyApproval":{"confirmed":true,"rationale":"append WBS row from planner-chat"}}'
```

## Arguments

| Field | Required | Description |
| --- | --- | --- |
| `planRef` | One of `planRef` / `planId` | Unified IdeaPlan ref (`plan-artifact:<uuid>`). |
| `planId` | One of `planRef` / `planId` | UUID alternative to `planRef`. |
| `wbsRow` | Yes | Single `PlanArtifactWbsItem` object (alias: `row`). |
| `expectedPlanningGeneration` | When policy `require` | Read from `list-tasks` / `get-next-actions`. |
| `policyApproval` | Yes | `{ "confirmed": true, "rationale": "…" }` on argv. |
| `clientMutationId` | No | Idempotent replay for the same append payload digest. |

## Preconditions

- Target document is a **unified IdeaPlan** envelope (`idea-plan` kind).
- Document `status` is **`planning`**.
- Planning payload exists (run `draft-plan-artifact` first when `identity` / `goals` are not yet seeded).

## Response codes (normative)

| Code | `ok` | Meaning |
| --- | --- | --- |
| `append-wbs-row-persisted` | true | New version written with appended row. |
| `append-wbs-row-idempotent-replay` | true | Same `clientMutationId` + matching digest. |
| `wbs-shape-invalid` | false | Row failed structural guard; `data.findings[]`. |
| `plan-artifact-schema-invalid` | false | Full artifact failed JSON Schema after append. |
| `wbs-id-conflict` | false | Duplicate `wbsId` on the plan. |
| `idea-plan-not-found` | false | No unified document for `planRef`. |
| `idea-plan-status-invalid` | false | Document not in `planning`. |
| `plan-artifact-draft-incomplete` | false | Missing planning payload — run `draft-plan-artifact` first. |
| `planning-generation-mismatch` | false | Stale `expectedPlanningGeneration`. |
| `policy-denied` | false | Missing/invalid `policyApproval`. |

## Related

- `draft-plan-artifact` — seed or replace full planning payload
- `get-plan-artifact-template` — minimal WBS row shape reference
- `patch-plan-artifact` — partial section updates (separate command)

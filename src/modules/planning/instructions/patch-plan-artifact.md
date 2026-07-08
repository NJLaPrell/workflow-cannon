<!--
agentCapsule|v=1|command=patch-plan-artifact|module=planning|schema_only=pnpm exec wk run patch-plan-artifact --schema-only '{}'
-->

# patch-plan-artifact

Apply a **section-scoped** patch to the latest **unified IdeaPlan** draft in `planning` status without resubmitting the full PlanArtifact JSON body.

**Tier:** B (mutation — requires JSON `policyApproval` and `expectedPlanningGeneration` when policy is `require`).

## Usage

```bash
pnpm exec wk run patch-plan-artifact '{"planRef":"plan-artifact:<planId>","section":"identity","patch":{"title":"Revised plan title"},"expectedPlanningGeneration":<n>,"policyApproval":{"confirmed":true,"rationale":"patch plan section from planner-chat"}}'
```

## Arguments

| Field | Required | Description |
| --- | --- | --- |
| `planRef` | One of `planRef` / `planId` | Unified IdeaPlan ref (`plan-artifact:<uuid>`). |
| `planId` | One of `planRef` / `planId` | UUID alternative to `planRef`. |
| `section` | Yes | `identity`, `goals`, or `wbs`. |
| `patch` | Yes | Section payload — object for `identity` / `wbs`; string array for `goals`. |
| `wbsId` | When `section` is `wbs` | Target row id (do not embed `wbsId` inside `patch`). |
| `expectedPlanningGeneration` | When policy `require` | Read from `list-tasks` / `get-next-actions`. |
| `policyApproval` | Yes | `{ "confirmed": true, "rationale": "…" }` on argv. |
| `clientMutationId` | No | Idempotent replay for the same patch payload digest. |

## Patch semantics

| Section | `patch` shape | Behavior |
| --- | --- | --- |
| `identity` | Object with `title`, `planningType`, `summary`, and/or `tags` | Shallow merge into `identity`. |
| `goals` | Non-empty `string[]` | Replaces the full `goals` array. |
| `wbs` | Object of row fields (no `wbsId`) | Shallow merge into the existing row identified by `wbsId`; merged row must pass WBS shape guard. |

## Preconditions

- Target document is a **unified IdeaPlan** envelope (`idea-plan` kind).
- Document `status` is **`planning`**.
- Planning payload exists (run `draft-plan-artifact` first when `identity` / `goals` are not yet seeded).

## Response codes (normative)

| Code | `ok` | Meaning |
| --- | --- | --- |
| `patch-plan-artifact-persisted` | true | New version written with section patch applied. |
| `patch-plan-artifact-idempotent-replay` | true | Same `clientMutationId` + matching digest. |
| `patch-section-invalid` | false | Unknown `section` value. |
| `patch-shape-invalid` | false | `patch` failed structural guard for the section. |
| `wbs-id-required` | false | `section` is `wbs` but `wbsId` missing. |
| `wbs-not-found` | false | No row with the supplied `wbsId`. |
| `wbs-shape-invalid` | false | Merged WBS row failed structural guard; `data.findings[]`. |
| `plan-artifact-schema-invalid` | false | Full artifact failed JSON Schema after patch. |
| `idea-plan-not-found` | false | No unified document for `planRef`. |
| `idea-plan-status-invalid` | false | Document not in `planning`. |
| `plan-artifact-draft-incomplete` | false | Missing planning payload — run `draft-plan-artifact` first. |
| `planning-generation-mismatch` | false | Stale `expectedPlanningGeneration`. |
| `policy-denied` | false | Missing/invalid `policyApproval`. |

## Related

- `draft-plan-artifact` — seed or replace full planning payload
- `append-wbs-row` — append a new WBS row
- `get-plan-artifact-template` — minimal section shape reference

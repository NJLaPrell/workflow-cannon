<!--
agentCapsule|v=1|command=draft-plan-artifact|module=planning|schema_only=pnpm exec wk run draft-plan-artifact --schema-only '{}'
-->

# draft-plan-artifact

Validate and optionally persist a **PlanArtifact v1** document (new `planId` or new `version`).

When the source idea links a **unified IdeaPlan document** (`linkedPlanArtifact` or active draft), persist merges structured plan content into that document’s **`plan` section** and top-level planning payload on the **existing** `planId` — no new standalone artifact identity is created.

**Contract:** repo-root **`PLANNER_COMMANDS.md`** §2 · **Schema:** **`PLANNER_SCHEMA.md`** · **Agent runbook:** **`.ai/runbooks/plan-artifact-workflow.md`**

**Handler status:** validate-only (`persist: false`) and persist (`persist: true`) are implemented (WP-3.2–3.3). **`--schema-only`** and **`list-commands`** remain authoritative for argv shape.

## Usage

```bash
# Validate only (Tier C — no policyApproval when persist is false)
pnpm exec wk run draft-plan-artifact '{"persist":false,"artifact":{...}}'

# Persist new version (Tier B)
pnpm exec wk run draft-plan-artifact '{"persist":true,"artifact":{...},"expectedPlanningGeneration":<n>,"policyApproval":{"confirmed":true,"rationale":"persist plan draft after brainstorm"}}'
```

## Arguments

| Field | Required | Description |
| --- | --- | --- |
| `artifact` | Yes | PlanArtifact v1 object (partial allowed when updating an existing `planId`). |
| `persist` | No | Default `true`. `false` = validate only (Tier C). |
| `planId` | No | Persist under existing id; omit to allocate new UUID (standalone PlanArtifact only). When `provenance.sourceIdeaId` links a unified IdeaPlan document, the handler pins to that document’s `planId`. |
| `importSource` | No | `import-build-plan` \| `import-wishlist` — sets `provenance.source`. |
| `expectedPlanningGeneration` | When policy `require` | Required when `persist: true`. |
| `policyApproval` | When `persist: true` | `{ "confirmed": true, "rationale": "…" }` on argv. |
| `clientMutationId` | No | Idempotent replay for same version payload digest. |
| `actor` | No | Mutation log actor override. |
| `config` | No | Invocation-local config override. |

## Response codes (normative)

| Code | `ok` | Meaning |
| --- | --- | --- |
| `plan-artifact-draft-persisted` | true | New version written; `data.planId`, `data.version`, `data.planRef`, `data.storagePath`. |
| `plan-artifact-draft-validated` | true | `persist: false`; validation only. |
| `plan-artifact-draft-idempotent-replay` | true | Same `clientMutationId` + matching digest. |
| `plan-artifact-schema-invalid` | false | JSON Schema / shape errors; `data.errors[]`. |
| `plan-artifact-version-conflict` | false | Supplied `version` ≠ `latest + 1`. |
| `plan-artifact-version-immutable` | false | Supplied `version` is accepted/finalized/superseded and cannot be overwritten. |
| `planning-generation-mismatch` | false | Stale `expectedPlanningGeneration`. |
| `policy-denied` | false | Missing/invalid `policyApproval` on persist. |

## Storage (when implemented)

- **Unified IdeaPlan:** `.workspace-kit/planning/plan-artifacts/{planId}/artifact.v{version}.json` — envelope with `status`, progressive sections (`brainstorm`, `plan`, …), and merged planning payload (`goals`, `wbs`, …) when idea-linked.
- **Standalone PlanArtifact:** same path layout; document validates as PlanArtifact v1 only.
- Index: SQLite module state `planning-plan-artifact:{planId}` (standalone drafts only).

## Fixtures

- `fixtures/planning/plan-artifact-minimal.valid.v1.json`
- `fixtures/planning/plan-artifact-full-feature.valid.v1.json`
- `fixtures/ideas/planning-state.fixture.json` — unified IdeaPlan planning-state envelope

## Related

- `review-plan-artifact` — rubric review (WP-4)
- `accept-plan-artifact` — operator acceptance (WP-5)
- `finalize-plan-to-phase` — WBS → tasks (WP-6)
- `start-idea-planning` — initializes unified document `plan` section before planner-chat
- CAE planning lenses activate on this command name when CAE shadow preflight runs (see `test/planning-session-cae-scope.test.mjs`).

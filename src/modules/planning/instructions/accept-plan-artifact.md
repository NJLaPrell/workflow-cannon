<!--
agentCapsule|v=1|command=accept-plan-artifact|module=planning|schema_only=pnpm exec wk run accept-plan-artifact --schema-only '{}'
-->

# accept-plan-artifact

Record explicit operator acceptance of a PlanArtifact v1; pin `approvedVersion` and set `status: accepted`. Requires prior review (no blockers when `strict: true`, the default).

**Contract:** repo-root **`PLANNER_COMMANDS.md`** §4 · **Schema:** **`PLANNER_SCHEMA.md`** §2.14 · **Agent runbook:** **`.ai/runbooks/plan-artifact-workflow.md`**

**Handler status:** acceptance persistence ships in **WP-5** (task T100466+). Until then, invocations return **`plan-artifact-command-not-implemented`**; **`--schema-only`** and **`list-commands`** are authoritative for argv shape.

## Usage

```bash
# Accept latest stored version (Tier B — policyApproval required)
pnpm exec wk run accept-plan-artifact '{"planId":"550e8400-e29b-41d4-a716-446655440000","approvalRecord":{"schemaVersion":1,"confirmed":true,"approvedVersion":2,"approvedAt":"2026-05-27T07:00:00.000Z","approvedBy":"operator@example.com","planRef":"plan-artifact:550e8400-e29b-41d4-a716-446655440000"},"expectedPlanningGeneration":<n>,"policyApproval":{"confirmed":true,"rationale":"operator accepted plan in dashboard"}}'

# Accept with deferred open questions documented
pnpm exec wk run accept-plan-artifact '{"planId":"550e8400-e29b-41d4-a716-446655440000","approvalRecord":{"schemaVersion":1,"confirmed":true,"approvedVersion":2,"approvedAt":"2026-05-27T07:00:00.000Z","approvedBy":"operator@example.com","planRef":"plan-artifact:550e8400-e29b-41d4-a716-446655440000","openQuestionsAccepted":["Use strict accept on warnings?"]},"openQuestionsAccepted":["Use strict accept on warnings?"],"expectedPlanningGeneration":<n>,"policyApproval":{"confirmed":true,"rationale":"accept with documented OQ deferral"}}'

# Non-strict accept when only warnings remain (handler validates review state)
pnpm exec wk run accept-plan-artifact '{"planId":"550e8400-e29b-41d4-a716-446655440000","strict":false,"approvalRecord":{...},"expectedPlanningGeneration":<n>,"policyApproval":{"confirmed":true,"rationale":"accept despite warnings"}}'
```

## Arguments

| Field | Required | Description |
| --- | --- | --- |
| `planId` | Yes | Load stored artifact from `.workspace-kit/planning/plan-artifacts/`. |
| `version` | No | Version to accept; default latest. Must match `approvalRecord.approvedVersion`. |
| `approvalRecord` | Yes | `{ schemaVersion: 1, confirmed: true, approvedVersion, approvedAt, approvedBy, planRef }` per **PLANNER_SCHEMA** §2.14. |
| `strict` | No | Default `true` — fail if last review had blockers. |
| `openQuestionsAccepted` | No | Copied into `approvalRecord` when deferring open questions. |
| `expectedPlanningGeneration` | When policy `require` | Copy from `get-task` / `list-tasks`. |
| `policyApproval` | Yes | `{ "confirmed": true, "rationale": "…" }` on argv (Tier B). |
| `clientMutationId` | No | Idempotent replay for same acceptance payload. |
| `actor` | No | Actor for provenance when persisting. |
| `config` | No | Invocation-local config override. |

## Response codes (normative)

| Code | `ok` | Meaning |
| --- | --- | --- |
| `plan-artifact-accepted` | true | `status` → `accepted`; `approvalRecord` persisted. |
| `plan-artifact-accept-idempotent-replay` | true | Already accepted same version with same payload. |
| `plan-artifact-accept-blocked` | false | Review blockers or open questions without `openQuestionsAccepted`. |
| `plan-artifact-version-mismatch` | false | `version` or `approvalRecord.approvedVersion` ≠ latest. |
| `plan-artifact-not-found` | false | Unknown `planId` / `version`. |
| `plan-artifact-schema-invalid` | false | Malformed `approvalRecord`. |
| `planning-generation-mismatch` | false | Stale `expectedPlanningGeneration`. |
| `policy-denied` | false | Missing/invalid `policyApproval`. |
| `plan-artifact-command-not-implemented` | false | Handler not shipped yet (WP-5.2+). |

## Success `data`

| Field | Description |
| --- | --- |
| `planId` | Accepted plan id. |
| `version` | Accepted artifact version. |
| `planRef` | `plan-artifact:<uuid>`. |
| `status` | `accepted`. |
| `approvalRecord` | Persisted approval block. |
| `replayed` | `true` on idempotent replay. |

## Related

- `review-plan-artifact` — rubric review before accept (WP-4)
- `finalize-plan-to-phase` — WBS → tasks after accept (WP-6)
- `draft-plan-artifact` — create or update draft (WP-3)

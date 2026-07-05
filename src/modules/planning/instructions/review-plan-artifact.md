<!--
agentCapsule|v=1|command=review-plan-artifact|module=planning|schema_only=pnpm exec wk run review-plan-artifact --schema-only '{}'
-->

# review-plan-artifact

Run deterministic rubric checks on a PlanArtifact v1 or unified IdeaPlan planning payload; return blockers, warnings, and coverage map. Does not change plan `status` unless `recordReview: true`.

When loading by `planId`, if the stored artifact file is a unified IdeaPlan document, the handler synthesizes a PlanArtifact-shaped payload from the document's top-level `goals`, `userStories`, and `wbs` arrays for rubric checks. With `recordReview: true`, the unified document must be in `planning` status and transitions to `reviewed` with a populated `review` section.

**Contract:** `--schema-only` flag is authoritative for arg shape · **Agent runbook:** **`.ai/runbooks/plan-artifact-workflow.md`**

**Handler status:** review engine and CLI handler ship in **WP-4** (core `reviewPlanArtifact` + this command).

## Usage

```bash
# Review stored plan (Tier C — no policyApproval when recordReview is false)
pnpm exec wk run review-plan-artifact '{"planId":"<uuid>","profile":"full-feature"}'

# Review inline artifact (validate + rubric)
pnpm exec wk run review-plan-artifact '{"artifact":{...},"profile":"minimal"}'

# Record reviewed status on index (Tier B)
pnpm exec wk run review-plan-artifact '{"planId":"<uuid>","recordReview":true,"expectedPlanningGeneration":<n>,"policyApproval":{"confirmed":true,"rationale":"operator recorded rubric review"}}'
```

## Arguments

| Field | Required | Description |
| --- | --- | --- |
| `planId` | Yes* | Load stored artifact from `.workspace-kit/planning/plan-artifacts/`. |
| `version` | No | Default latest on disk / index. |
| `artifact` | Yes* | Inline PlanArtifact v1 instead of load (*one of `planId` or `artifact`*). |
| `profile` | No | `minimal` \| `refactor` \| `full-feature` \| `sprint-phase`; default `minimal` when omitted. |
| `waivers` | No | `{ code, rationale }[]` (slice coverage codes). |
| `recordReview` | No | Default `false`. `true` writes `status: reviewed` as next artifact version, persists `latestReview` on the plan index, and may update the planning session (Tier B). For unified IdeaPlan documents, transitions `planning` → `reviewed` and writes the `review` section. |
| `ideaId` | No | Optional explicit idea id when promoting session state after `recordReview`. |
| `sessionId` | No | Optional explicit session id; must match the active planning session when set. |
| `expectedPlanningGeneration` | When policy `require` | Required when `recordReview: true`. |
| `policyApproval` | When `recordReview: true` | `{ "confirmed": true, "rationale": "…" }` on argv. |
| `actor` | No | Actor for mutation metadata when `recordReview: true`. |
| `config` | No | Invocation-local config override. |

## Response codes (normative)

| Code | `ok` | Meaning |
| --- | --- | --- |
| `plan-artifact-review-complete` | true | Findings returned; `data.passed` is true (zero blockers). |
| `plan-artifact-review-blocked` | true | Review ran; blockers present (`data.passed: false`). |
| `plan-artifact-not-found` | false | Unknown `planId` / `version`. |
| `plan-artifact-schema-invalid` | false | Loaded or inline artifact fails schema. |
| `idea-plan-status-invalid` | false | Unified document is not in `planning` when `recordReview: true`. |
| `planning-generation-mismatch` | false | Stale `expectedPlanningGeneration` when `recordReview: true`. |
| `policy-denied` | false | Missing/invalid `policyApproval` when `recordReview: true`. |
## Success `data`

| Field | Description |
| --- | --- |
| `passed` | Boolean — no blockers. |
| `profile` | Profile used for rubric rules. |
| `blockers` | `{ code, message, path?, wbsId? }[]` |
| `warnings` | Same shape as blockers. |
| `coverageMap` | Goals/stories ↔ WBS coverage. |
| `sizingFindings` | Per-WBS sizing issues. |
| `openQuestionCount` | Integer. |
| `blockerCount` | Integer — dashboard-friendly blocker count. |
| `warningCount` | Integer — dashboard-friendly warning count. |
| `wbsCount` | Integer — WBS row count on the reviewed artifact. |
| `coverageSummary` | Redacted goal/story/slice coverage counts. |
| `reviewRecord` | Stable review record shape (`schemaVersion: 1`). |
| `planningChatSession` | Present when `recordReview: true` and idea/session context promotes session to `needs_revision` or `approval_ready`. |

## Fixtures

- `fixtures/planning/plan-artifact-minimal.valid.v1.json`
- `fixtures/planning/plan-artifact-full-feature.valid.v1.json`
- `fixtures/planning/plan-artifact-minimal.invalid.empty-goals.v1.json` (schema-invalid)

## Related

- `draft-plan-artifact` — validate/persist draft (WP-3)
- `accept-plan-artifact` — operator acceptance gate (WP-5)
- `finalize-plan-to-phase` — WBS → tasks (WP-6)
- CAE planning lenses activate on this command name when CAE shadow preflight runs.

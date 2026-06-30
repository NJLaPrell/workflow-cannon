# PlanArtifact v1 — command contracts

**Artifact:** `PLANNER_COMMANDS.md` (repo root)  
**Status:** Draft for human review (**A-CONTRACTS**, **A-POLICY**)  
**Schema:** [`PLANNER_SCHEMA.md`](./PLANNER_SCHEMA.md) (**A-SCHEMA**)  
**Architecture:** [`PLANNER_ARCHITECTURE.md`](./PLANNER_ARCHITECTURE.md) (**A-ARCH**)  
**Implementation:** `src/modules/planning/instructions/*.md`, planning module `onCommand` (WP-3–WP-6)

Unified request/response contracts for the PlanArtifact lifecycle. Per-command JSON Schema ships in WP-3+ (`--schema-only`); this document is the **human + agent contract** until those files exist.

---

## 1. Shared conventions

### 1.1 Invocation

```bash
pnpm exec wk run <command> '<single-json-object>'
```

Agents: prefer **`pnpm exec wk`** (clean stdout). Attach **`policyApproval`** inside the JSON object for Tier **B** mutators — not env-only (`WORKSPACE_KIT_POLICY_APPROVAL` does **not** apply to `run`). See [`.ai/POLICY-APPROVAL.md`](./.ai/POLICY-APPROVAL.md).

### 1.2 Standard envelope fields (all commands)

| Field | Tier | Description |
| --- | --- | --- |
| `expectedPlanningGeneration` | B mutators when `tasks.planningGenerationPolicy` is `require` | Read from `get-task` / `get-next-actions` / prior command `data.planningGeneration`. |
| `policyApproval` | B mutators | `{ "confirmed": true, "rationale": "…" }` — task-specific prose; not Dashboard boilerplate. |
| `clientMutationId` | Optional on persist paths | Idempotency key; same semantics as `persist-planning-execution-drafts`. |
| `actor` | Optional | Overrides resolved actor in mutation logs. |
| `dryRun` | Where noted | `true` = validate + preview only; no plan/task writes. |

### 1.3 Success response shape (all commands)

```json
{
  "ok": true,
  "code": "<command-specific-code>",
  "message": "…",
  "data": {
    "schemaVersion": 1,
    "planningGeneration": 3979,
    "planningGenerationPolicy": "require"
  }
}
```

Failure responses use `ok: false`, stable `code`, and `remediation.instructionPath` when available.

### 1.4 PlanArtifact payload

Unless noted, **`artifact`** or **`plan`** in argv is a full or partial **PlanArtifact v1** document per [`PLANNER_SCHEMA.md`](./PLANNER_SCHEMA.md). Validators merge partial drafts with stored version on update.

### 1.5 Related task-engine commands (reuse, do not duplicate)

| Command | When |
| --- | --- |
| `review-planning-execution-drafts` | `finalize-plan-to-phase` dry-run and persist preflight on normalized task rows. |
| `persist-planning-execution-drafts` | **Only** path that writes execution tasks from an accepted plan. |

---

## 2. `draft-plan-artifact`

**Module:** `planning` · **Tier:** B when `persist: true` · **Mutates:** plan store (new version)

### 2.1 Purpose

Validate and optionally persist a PlanArtifact v1 document (new `planId` or new `version`).

### 2.2 Arguments

| Field | Required | Description |
| --- | --- | --- |
| `artifact` | Yes | PlanArtifact v1 object (partial allowed if `planId` exists). |
| `persist` | No | Default `true`. `false` = validate only (Tier C). |
| `planId` | No | Create under existing id; omit to allocate new UUID. |
| `importSource` | No | `import-build-plan` \| `import-wishlist` — sets `provenance.source`. |
| `expectedPlanningGeneration` | When policy `require` | Required when `persist: true`. |
| `policyApproval` | When `persist: true` | Required when persisting. |
| `clientMutationId` | No | Idempotent replay for same version payload. |

### 2.3 Response codes

| Code | `ok` | Meaning |
| --- | --- | --- |
| `plan-artifact-draft-persisted` | true | New version written; returns `planId`, `version`, `planRef`, path. |
| `plan-artifact-draft-validated` | true | `persist: false`; validation only. |
| `plan-artifact-draft-idempotent-replay` | true | Same `clientMutationId` and matching digest. |
| `plan-artifact-schema-invalid` | false | JSON Schema / shape errors; `data.errors[]`. |
| `plan-artifact-version-conflict` | false | Supplied `version` not equal to `latest + 1`. |
| `planning-generation-mismatch` | false | Stale `expectedPlanningGeneration`. |
| `policy-denied` | false | Missing/invalid `policyApproval`. |

### 2.4 Success `data` (persist)

| Field | Description |
| --- | --- |
| `planId` | Stable id. |
| `version` | Integer written. |
| `planRef` | Envelope planRef. |
| `storagePath` | Relative path under `.workspace-kit/planning/plan-artifacts/`. |
| `status` | Always `draft` on create. |

### 2.5 Example (validate only)

```bash
pnpm exec wk run draft-plan-artifact '{"persist":false,"artifact":{…}}'
```

### 2.6 Example (persist)

```bash
pnpm exec wk run draft-plan-artifact '{"persist":true,"artifact":{…},"expectedPlanningGeneration":3979,"policyApproval":{"confirmed":true,"rationale":"persist plan draft after CAE-guided brainstorm"}}'
```

---

## 3. `review-plan-artifact`

**Module:** `planning` · **Tier:** C · **Mutates:** nothing (optional cache of last review on plan index)

### 3.1 Purpose

Run deterministic rubric checks (**A-RUBRIC**) on a plan; return blockers, warnings, coverage map. Does not change plan `status` to `reviewed` unless `recordReview: true`.

### 3.2 Arguments

| Field | Required | Description |
| --- | --- | --- |
| `planId` | Yes* | Load stored artifact. |
| `version` | No | Default latest. |
| `artifact` | Yes* | Inline artifact instead of load (*one of `planId` or `artifact`). |
| `profile` | No | `minimal` \| `refactor` \| `full-feature` \| `sprint-phase`; default from `identity.planningType`. |
| `recordReview` | No | Default `false`. `true` sets `status: reviewed` and stores summary on index (Tier B). |

When `recordReview: true`, also pass `expectedPlanningGeneration` + `policyApproval`.

### 3.3 Response codes

| Code | `ok` | Meaning |
| --- | --- | --- |
| `plan-artifact-review-complete` | true | Findings returned; `data.passed` reflects zero blockers. |
| `plan-artifact-review-blocked` | true | Review ran; blockers present (`data.passed: false`). |
| `plan-artifact-not-found` | false | Unknown `planId`/`version`. |
| `plan-artifact-schema-invalid` | false | Loaded artifact fails schema. |

### 3.4 Success `data`

| Field | Description |
| --- | --- |
| `passed` | Boolean — no blockers. |
| `profile` | Profile used. |
| `blockers` | `{ "code", "message", "path"?, "wbsId"? }[]` |
| `warnings` | Same shape as blockers. |
| `coverageMap` | Goals/stories ↔ WBS coverage (Gap 5). |
| `sizingFindings` | Per-WBS sizing issues. |
| `openQuestionCount` | Integer. |

### 3.5 Example

```bash
pnpm exec wk run review-plan-artifact '{"planId":"550e8400-e29b-41d4-a716-446655440000","profile":"full-feature"}'
```

---

## 4. `accept-plan-artifact`

**Module:** `planning` · **Tier:** B · **Mutates:** plan store (`approvalRecord`, `status: accepted`)

### 4.1 Purpose

Record explicit operator acceptance; pin `approvedVersion`. Acceptance requires the latest version to be the latest recorded reviewed version, review blockers always refuse acceptance, and warning-only reviewed plans remain acceptable.

### 4.2 Arguments

| Field | Required | Description |
| --- | --- | --- |
| `planId` | Yes | |
| `version` | No | Version to accept; default latest. Must match `approvalRecord.approvedVersion` written and the latest reviewed version. |
| `approvalRecord` | Yes | `{ "confirmed": true, … }` per PLANNER_SCHEMA §2.14; `planRef` required. |
| `strict` | No | Retained for argv compatibility; reviewed blockers still block acceptance. |
| `openQuestionsAccepted` | No | Copied into `approvalRecord` when deferring OQs. Every remaining open question must be resolved or explicitly listed here. |
| `expectedPlanningGeneration` | When policy `require` | |
| `policyApproval` | Yes | Human acceptance of mutation. |

### 4.3 Response codes

| Code | `ok` | Meaning |
| --- | --- | --- |
| `plan-artifact-accepted` | true | `status` → `accepted`. |
| `plan-artifact-accept-idempotent-replay` | true | Already accepted same version. |
| `plan-artifact-accept-blocked` | false | Latest version is not reviewed, reviewed version has blockers, or open questions are not fully resolved/deferred. |
| `plan-artifact-version-mismatch` | false | `version` ≠ latest. |
| `plan-artifact-not-found` | false | |

### 4.4 Example

```bash
pnpm exec wk run accept-plan-artifact '{"planId":"550e8400-e29b-41d4-a716-446655440000","approvalRecord":{"schemaVersion":1,"confirmed":true,"approvedVersion":2,"approvedAt":"2026-05-27T07:00:00.000Z","approvedBy":"operator@example.com","planRef":"plan-artifact:550e8400-e29b-41d4-a716-446655440000"},"expectedPlanningGeneration":3979,"policyApproval":{"confirmed":true,"rationale":"operator accepted plan in dashboard"}}'
```

---

## 5. `finalize-plan-to-phase`

**Module:** `planning` (orchestration) + **task-engine** (persist) · **Tier:** B · **Mutates:** plan index + task store (when not dry-run)

### 5.1 Purpose

Normalize WBS → task drafts, run batch review, optionally persist tasks into a target phase. Requires **`status: accepted`** on the plan.

### 5.2 Arguments

| Field | Required | Description |
| --- | --- | --- |
| `planId` | Yes | |
| `version` | No | Default latest accepted version. |
| `dryRun` | No | Default `true` for agent safety; **`false`** to persist tasks. |
| `targetPhaseKey` | No | Overrides WBS phase hints; command-level wins. |
| `targetPhase` | No | Label; default `Phase <targetPhaseKey>`. |
| `desiredStatus` | No | `proposed` \| `ready`; default `ready`. |
| `wbsFilter` | No | `wbsId[]` — finalize subset only. |
| `clientMutationId` | No | Forwarded to `persist-planning-execution-drafts`. |
| `expectedPlanningGeneration` | When policy `require` | |
| `policyApproval` | Yes when `dryRun: false` | |

### 5.3 Internal steps (normative)

1. Load plan; assert `status === accepted` and `approvalRecord.approvedVersion === version`.
2. For each selected WBS row: `normalizeWbsItemToTaskDraft()` → exactly one task row with title, synthesized body/description, acceptance criteria, verification context, dependencies, phase/status, and plan/WBS provenance metadata.
3. Call **`review-planning-execution-drafts`** (or equivalent internal) on `tasks[]`.
4. If `dryRun: true` — return preview + findings without task or plan-status writes.
5. If `dryRun: false` — call **`persist-planning-execution-drafts`** with `planRef`, `planningType` from `identity`, provenance fields, idempotency, policy approval, and planning generation; update plan `status: finalized` after successful task persistence.

### 5.4 Response codes

| Code | `ok` | Meaning |
| --- | --- | --- |
| `plan-artifact-finalize-preview` | true | `dryRun: true`; `data.taskPreview[]`, `data.review`. |
| `plan-artifact-finalize-persisted` | true | Tasks created; `data.createdTasks`, `data.count`. |
| `plan-artifact-finalize-idempotent-replay` | true | Replay via `clientMutationId`. |
| `plan-artifact-not-accepted` | false | Plan not in `accepted` state. |
| `plan-artifact-finalize-review-failed` | false | Task-batch review blockers. |
| `planning-execution-drafts-persisted` | true | Delegated success code from task-engine (alias allowed). |

### 5.5 Success `data` (preview)

| Field | Description |
| --- | --- |
| `taskPreview` | Normalized `tasks[]` (same as persist argv). |
| `taskGenerationPayloads` | Optional denormalized copy for dashboard. |
| `phaseKey` | Resolved target phase. |
| `review` | Embedded `review-planning-execution-drafts` outcome. |

### 5.6 Example (dry-run)

```bash
pnpm exec wk run finalize-plan-to-phase '{"planId":"550e8400-e29b-41d4-a716-446655440000","dryRun":true}'
```

### 5.7 Example (persist)

```bash
pnpm exec wk run finalize-plan-to-phase '{"planId":"550e8400-e29b-41d4-a716-446655440000","dryRun":false,"targetPhaseKey":"110","targetPhase":"Phase 110","desiredStatus":"ready","expectedPlanningGeneration":3979,"policyApproval":{"confirmed":true,"rationale":"materialize accepted plan WBS to phase 110"}}'
```

---

## 6. Policy touchpoints (**A-POLICY**)

| Command | Tier | `policyApproval` | Notes |
| --- | --- | --- | --- |
| `draft-plan-artifact` | C if `persist: false`; **B** if `persist: true` | Required on persist | Validate-only safe for agents exploring shape. |
| `review-plan-artifact` | C | Not required | `recordReview: true` → **B**. |
| `accept-plan-artifact` | **B** | Required | Explicit human gate; maps to dashboard Accept action. |
| `finalize-plan-to-phase` | C if `dryRun: true`; **B** if `dryRun: false` | Required on persist | Dry-run encouraged before persist. |
| `review-planning-execution-drafts` | C | Not required | Called internally/by agents before finalize. |
| `persist-planning-execution-drafts` | **B** | Required | Unchanged; finalize delegates here. |

**Dashboard:** Extension uses `buildDashboardPolicyApproval` for routine vs elevated drawer tiers — kit validation unchanged ([`.ai/DASHBOARD-POLICY-UX.md`](./.ai/DASHBOARD-POLICY-UX.md)).

**Agents:** Terminal runs must supply JSON `policyApproval.rationale` with task-specific prose per [`.ai/POLICY-APPROVAL.md`](./.ai/POLICY-APPROVAL.md).

**Publish / phase ship:** Plan commands do **not** replace npm publish or phase-closeout human gates ([`.ai/RELEASING.md`](./.ai/RELEASING.md)).

---

## 7. Idempotency

| Command | Key | Replay behavior |
| --- | --- | --- |
| `draft-plan-artifact` | `clientMutationId` | Same id + same artifact digest → returns existing `planId`/`version`. |
| `accept-plan-artifact` | `clientMutationId` (optional) | Same acceptance on same version → `plan-artifact-accept-idempotent-replay`. |
| `finalize-plan-to-phase` | `clientMutationId` | Forwarded to persist; per-task `clientMutationId::<taskId>`. |

Digest includes: normalized artifact JSON (sorted keys), `planId`, `version`, `targetPhaseKey`, `desiredStatus`, `dryRun`.

---

## 8. Error code index (cross-command)

| Code | Typical command |
| --- | --- |
| `invalid-run-args` | Any — fix via `--schema-only` |
| `planning-generation-mismatch` | Any Tier B mutator |
| `policy-denied` | Tier B without approval |
| `plan-artifact-schema-invalid` | draft, review |
| `plan-artifact-not-found` | review, accept, finalize |
| `plan-artifact-not-accepted` | finalize |
| `plan-artifact-accept-blocked` | accept |
| `plan-artifact-finalize-review-failed` | finalize |
| `duplicate-task-id` | finalize → persist delegate |
| `idempotency-key-conflict` | draft, finalize |

---

## 9. Command pipeline (reference)

```text
draft-plan-artifact (persist)
  → review-plan-artifact (optional recordReview)
  → accept-plan-artifact
  → finalize-plan-to-phase (dryRun: true)
  → finalize-plan-to-phase (dryRun: false)
```

---

## 10. Review rubric pointer (**A-RUBRIC**)

Blocker/warning rules, sizing, goal↔WBS coverage, and profile-specific section requirements: **[`PLANNER_REVIEW_RUBRIC.md`](./PLANNER_REVIEW_RUBRIC.md)**. `review-plan-artifact` must load rubric by `profile` without hard-coded strings in the handler.

---

## 11. Open questions (contract review)

1. **`recordReview` on review** — default `false` to keep review read-only; confirm dashboard needs `reviewed` status on index.
2. **`finalize` plan status** — set `finalized` on dry-run preview? **Recommendation:** only on successful persist.
3. **Command placement** — all four on `planning` module vs split finalize orchestration into `task-engine`. **Recommendation:** planning module owns all four; task-engine stays delegate.

---

## 12. References

| Resource | Purpose |
| --- | --- |
| [`PLANNER_SCHEMA.md`](./PLANNER_SCHEMA.md) | Field shapes |
| [`PLANNER_ARCHITECTURE.md`](./PLANNER_ARCHITECTURE.md) | Storage, boundaries |
| [`.ai/AGENT-CLI-MAP.md`](./.ai/AGENT-CLI-MAP.md) | Tier table |
| [`.ai/POLICY-APPROVAL.md`](./.ai/POLICY-APPROVAL.md) | Approval lanes |
| `src/modules/task-engine/instructions/persist-planning-execution-drafts.md` | Persist delegate |
| `src/modules/task-engine/instructions/review-planning-execution-drafts.md` | Review delegate |

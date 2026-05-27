# PlanArtifact v1 — review rubric

**Artifact:** `PLANNER_REVIEW_RUBRIC.md` (repo root)  
**Status:** Draft for human review (**A-RUBRIC**)  
**Consumed by:** `review-plan-artifact` ([`PLANNER_COMMANDS.md`](./PLANNER_COMMANDS.md))  
**Schema:** [`PLANNER_SCHEMA.md`](./PLANNER_SCHEMA.md) · **Profiles:** §3  

Deterministic quality bar for PlanArtifact v1 **before** accept/finalize. This rubric is **not** chat guidance — CAE lenses are advisory; these rules are blocking or warning codes returned in `data.blockers` / `data.warnings`.

---

## 1. Severity model

| Severity | Meaning | Effect on `accept-plan-artifact` (default `strict: true`) |
| --- | --- | --- |
| **blocker** | Plan is incomplete or unsafe to accept. | **Fail** accept. |
| **warning** | Quality gap; operator may accept with documented waiver. | **Pass** review `data.passed` if zero blockers; accept may require `openQuestionsAccepted` or rubric waiver metadata. |

**`data.passed`:** `true` only when `blockers.length === 0`.

Each finding:

```json
{
  "code": "RUBRIC-…",
  "severity": "blocker|warning",
  "message": "Human-readable explanation",
  "path": "json-pointer-style path",
  "wbsId": "optional WBS-…"
}
```

---

## 2. Relationship to `ux-cae-pre-persist-v1`

| Layer | Command | Profile | What it checks |
| --- | --- | --- | --- |
| **Plan artifact** | `review-plan-artifact` | **A-RUBRIC** (this doc) | Whole-plan sections, WBS coverage, goal↔WBS map, phase recommendations, acceptance readiness. |
| **Task rows** | `review-planning-execution-drafts` | `ux-cae-pre-persist-v1` | Per-row task quality after normalization (splitting, verification slices, rollout/rollback, vague AC). |

**Order (normative):**

```text
review-plan-artifact (A-RUBRIC)
  → accept-plan-artifact
  → finalize-plan-to-phase dryRun
      → review-planning-execution-drafts (ux-cae-pre-persist-v1) on normalized tasks[]
  → finalize-plan-to-phase persist
```

Do **not** fold plan-level Gap 5 checks into `ux-cae-pre-persist-v1`. Extend task profile only for row-level gaps (e.g. vague AC). Plan rubric may **reference** task findings in finalize preview but keeps separate rule ids.

---

## 3. Profiles (section requirements)

Profiles match [`PLANNER_SCHEMA.md`](./PLANNER_SCHEMA.md) §3. Review command selects `profile` explicitly or defaults from `identity.planningType`.

### 3.1 Core sections (all profiles)

| Section / rule | Blocker if |
| --- | --- |
| `identity.title` | Missing or whitespace. |
| `identity.planningType` | Missing or not in allowed enum. |
| `goals` | Missing or empty array. |
| `nonGoals` | Field missing (empty array allowed). |
| `valueAssessment` | Missing `impact` or `confidence`. |
| `riskAssessment` | Field missing (empty array allowed). |
| `technicalImpact.systemsTouched` | Field missing. |
| `testingStrategy.layers` | Missing or empty. |
| `testingStrategy.criticalPaths` | Missing or empty. |
| `implementationGuidance` | Missing or empty. |
| `whatNotToDo` | Missing or empty. |
| `assumptions` | Field missing. |
| `openQuestions` | Field missing. |
| `wbs` | Missing, empty, or any row fails WBS rules (§4). |
| `phaseRecommendations` | Missing, empty, or no `isPrimary: true`. |
| `provenance` | Missing required fields per schema. |

### 3.2 Profile-specific sections

| Profile | Extra blockers |
| --- | --- |
| **`minimal`** | None beyond core. |
| **`refactor`** | `architecture.overview` required. |
| **`full-feature`** | `userStories` non-empty; `architecture.overview` required; if UI in scope (`uiUxDirection.hasUiChanges` or systems mention dashboard/extension), `uiUxDirection.summary` required. |
| **`sprint-phase`** | `phaseRecommendations.length >= 2`; each WBS row should have `recommendedPhase` or command supplies `targetPhaseKey` at finalize. |

### 3.3 Conditional warnings (all profiles)

| Code | Warning when |
| --- | --- |
| `RUBRIC-OQ-UNRESOLVED` | `openQuestions.length > 0` and no matching `approvalRecord.openQuestionsAccepted` (accept-time check; warning at review). |
| `RUBRIC-RISK-HIGH-UNMITIGATED` | Any `riskAssessment` item `severity: high` without `mitigation`. |
| `RUBRIC-VALUE-LOW-CONFIDENCE` | `valueAssessment.confidence === low` and fewer than 2 `assumptions`. |

---

## 4. WBS rules (per row)

### 4.1 Blockers

| Code | Condition |
| --- | --- |
| `RUBRIC-WBS-MISSING-FIELD` | Any required WBS field missing per PLANNER_SCHEMA §4. |
| `RUBRIC-WBS-EMPTY-SCOPE` | `technicalScope` or `acceptanceCriteria` or `testingVerification` empty. |
| `RUBRIC-WBS-DUP-ID` | Duplicate `wbsId` in plan. |
| `RUBRIC-WBS-BAD-DEP` | `dependsOn` references unknown `wbsId`. |
| `RUBRIC-WBS-PAYLOAD-INVALID` | `generatedTaskPayload` missing or fails task-row shape. |
| `RUBRIC-WBS-LOW-SIZING-OVERSIZE` | `sizingConfidence: low` and combined scope+AC lines > 12 bullets (oversized for one session). |

### 4.2 Warnings (sizing — T-4.3)

| Code | Condition |
| --- | --- |
| `RUBRIC-WBS-VAGUE-AC` | Any AC line < 4 words or contains only "done", "complete", "works". |
| `RUBRIC-WBS-VAGUE-DONE` | `doneMeans` < 10 words. |
| `RUBRIC-WBS-NO-VERIFY` | `testingVerification` has no test-layer keyword (test, verify, check, CI, extension, e2e). |
| `RUBRIC-WBS-MEDIUM-LARGE` | `sizingConfidence: medium` and > 8 scope bullets. |

---

## 5. Coverage map (Gap 5 — plan level)

`review-plan-artifact` returns `data.coverageMap`:

```json
{
  "goals": { "covered": ["…"], "uncovered": [] },
  "userStories": { "covered": ["US-1"], "uncovered": [] },
  "slices": {
    "architecture": "covered|missing|waived",
    "uiUx": "covered|missing|waived|not-applicable",
    "testing": "covered|missing",
    "rolloutDocsMigration": "covered|missing|waived"
  }
}
```

### 5.1 Blockers

| Code | Condition |
| --- | --- |
| `RUBRIC-COV-GOAL` | Any `goals[]` entry has zero WBS rows with `goalMapping` referencing it. |
| `RUBRIC-COV-STORY` | Profile `full-feature`: any `userStories[].id` not referenced in any `goalMapping` or WBS title/approach text. |
| `RUBRIC-COV-ARCH` | Profile `refactor` or `full-feature`: `slices.architecture === missing`. |
| `RUBRIC-COV-UI` | UI in scope and `slices.uiUx === missing`. |
| `RUBRIC-COV-TEST` | `slices.testing === missing` (no WBS row whose `testingVerification` mentions layers from `testingStrategy.layers`). |
| `RUBRIC-COV-ROLLOUT` | Plan touches production/user-facing systems and `slices.rolloutDocsMigration === missing`. |

### 5.2 Waivers

Operator may set on plan index metadata (review argv `waivers[]`):

```json
{ "code": "RUBRIC-COV-ROLLOUT", "rationale": "Internal tool only; no production rollout" }
```

Waived slice must not be `blocker`; recorded as `waived` in coverage map.

---

## 6. PLANNER Step 4 alignment (review command checks)

| Step 4 concern | Rubric enforcement |
| --- | --- |
| Missing required sections | §3 core + profile |
| Unresolved risks | §3.3 `RUBRIC-RISK-HIGH-UNMITIGATED` |
| Weak user stories | §5.1 `RUBRIC-COV-STORY` + story field shape in schema |
| Testing strategy quality | `testingStrategy.criticalPaths` non-empty; §5.1 test slice |
| WBS quality | §4 |
| Technical impact stated | `technicalImpact.systemsTouched` |
| Assumptions / open questions | §3.1 + §3.3 |
| Implementation warnings | `whatNotToDo` non-empty (warning if empty: `RUBRIC-WARN-NO-ANTIPATTERNS`) |

---

## 7. Accept / finalize gates (cross-reference)

| Gate | Rule |
| --- | --- |
| **accept** | Zero blockers from last `review-plan-artifact` with same `version` unless `strict: false` (not recommended). |
| **accept** | `openQuestions` empty OR listed in `openQuestionsAccepted`. |
| **finalize** | `status === accepted` and `approvalRecord.approvedVersion === version`. |
| **finalize persist** | `review-planning-execution-drafts` zero blockers on normalized `tasks[]`. |

---

## 8. Implementation notes (WP-4)

- `reviewPlanArtifact(plan, { profile, waivers })` iterates rules in order: schema validate → §3 → §4 → §5.
- Each rule has stable `code` for unit tests (`test/fixtures/planning/plan-review-*.json`).
- Do not hard-code rubric prose in TypeScript beyond loading this spec / generated rule table.
- Profile `ux-cae-pre-persist-v1` remains in task-engine; optional bridge: map `RUBRIC-WBS-VAGUE-AC` to similar task finding codes in finalize preview only.

---

## 9. Example review output (excerpt)

```json
{
  "passed": false,
  "profile": "full-feature",
  "blockers": [
    {
      "code": "RUBRIC-COV-GOAL",
      "severity": "blocker",
      "message": "Goal 'Operators complete draft→accept→finalize in Dashboard' has no WBS goalMapping",
      "path": "/goals/0"
    }
  ],
  "warnings": [
    {
      "code": "RUBRIC-WBS-MEDIUM-LARGE",
      "severity": "warning",
      "message": "WBS-2 has 9 scope bullets with medium sizing confidence",
      "wbsId": "WBS-2"
    }
  ],
  "coverageMap": {
    "goals": { "covered": [], "uncovered": ["Operators complete draft→accept→finalize in Dashboard"] },
    "slices": { "architecture": "covered", "uiUx": "covered", "testing": "missing", "rolloutDocsMigration": "waived" }
  }
}
```

---

## 10. Open questions (rubric review)

1. Numeric thresholds (12 bullets, 8 bullets) — tune with fixtures after first implementation pass.
2. Should `RUBRIC-OQ-UNRESOLVED` be blocker at **accept** only? **Recommendation:** warning at review, blocker at accept.
3. Merge this file into `PLANNER_COMMANDS.md` appendix later? **Recommendation:** keep separate for A-RUBRIC approval boundary.

---

## 11. References

| Resource | Purpose |
| --- | --- |
| [`PLANNER_SCHEMA.md`](./PLANNER_SCHEMA.md) | Field shapes, profiles |
| [`PLANNER_COMMANDS.md`](./PLANNER_COMMANDS.md) | `review-plan-artifact` contract |
| `src/modules/task-engine/instructions/review-planning-execution-drafts.md` | `ux-cae-pre-persist-v1` |
| [`PLANNER.md`](./PLANNER.md) | Gap 5, Step 4 |

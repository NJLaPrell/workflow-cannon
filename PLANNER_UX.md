# PlanArtifact v1 — dashboard UX mockups (**A-UX**)

**Artifact:** `PLANNER_UX.md` (repo root)  
**Status:** Approved for implementation (**A-UX**)  
**Product:** [`PLANNER.md`](./PLANNER.md) Step 7 · **Compat:** [`PLANNER_ARCHITECTURE.md`](./PLANNER_ARCHITECTURE.md) §8  
**Contracts:** [`PLANNER_COMMANDS.md`](./PLANNER_COMMANDS.md) · **Summary fields:** T-7.1 (`dashboard-summary.planArtifact`)

Annotated wireframes for the Cursor Workflow Cannon dashboard. Implementation: WP-7 (T-7.1–T-7.5). **No PNG required for sign-off** — ASCII layouts + state table; optional Figma can replace in a follow-up PR.

---

## 1. Information architecture

```text
Dashboard (existing)
├── Queue / tasks (unchanged)
├── Planning (existing build-plan wizard — demoted copy, §8 A-COMPAT)
└── Plan lifecycle (NEW panel — primary for PlanArtifact)
    ├── Status strip (draft | in_review | accepted | finalized)
    ├── Draft & open questions
    ├── Review findings + WBS preview
    ├── Accept + policy drawer
    └── Finalize (dry-run preview → persist)
```

**Poll source:** `workspace-kit run dashboard-summary` → `planArtifact` object (T-7.1). Legacy `planningSession` chip remains for `build-plan` resume.

---

## 2. Panel placement

```text
┌─────────────────────────────────────────────────────────────────┐
│ Workflow Cannon Dashboard                          [↻ Refresh]   │
├──────────────────────────────┬──────────────────────────────────┤
│ Queue · Next actions         │  PLAN LIFECYCLE (new)            │
│ (existing)                   │  ┌────────────────────────────┐  │
│                              │  │ Status: Draft v3           │  │
│                              │  │ planRef: planning:feat:…   │  │
│                              │  └────────────────────────────┘  │
│                              │  [sections per state below]      │
├──────────────────────────────┤                                  │
│ Guided planning (legacy)     │                                  │
│ "Quick interview" link       │                                  │
└──────────────────────────────┴──────────────────────────────────┘
```

On narrow webview: Plan lifecycle stacks **above** queue; wizard collapses to accordion footer.

---

## 3. State: Draft (no review yet)

```text
┌─ Plan lifecycle ────────────────────────────────────────────────┐
│ ● Draft   Version 3   Updated 2m ago                            │
│ Completeness: ████████░░  82%   Open questions: 2             │
├─────────────────────────────────────────────────────────────────┤
│ OPEN QUESTIONS (prominent)                                      │
│  ! Goals lack measurable success criteria (RUBRIC-GOALS-001)    │
│  ? Phase target not set — recommend Phase 111                   │
├─────────────────────────────────────────────────────────────────┤
│ Summary                                                         │
│  Feature: PlanArtifact dashboard                                │
│  Goals: 3 · Risks: 2 · WBS rows: 12                             │
│  [Expand draft sections ▼]                                      │
├─────────────────────────────────────────────────────────────────┤
│  [ Run review ]     [ Open in CLI… ]                            │
└─────────────────────────────────────────────────────────────────┘
```

**Actions:** `review-plan-artifact` (primary). No Accept/Finalize until review run.

---

## 4. State: Review findings (passed with warnings)

```text
┌─ Plan lifecycle ────────────────────────────────────────────────┐
│ ◐ In review   Last review: pass (2 warnings)                   │
├─────────────────────────────────────────────────────────────────┤
│ FINDINGS                                    [Filter: All ▼]     │
│  ⚠ RUBRIC-SIZE-002  WBS row T-7.3 missing sizing estimate      │
│  ⚠ RUBRIC-DEP-001   Optional dependency cycle risk (warn)       │
├─────────────────────────────────────────────────────────────────┤
│ WBS PREVIEW (read-only table)                                   │
│  ID      Title                          Size   Deps   AC        │
│  W-1     Extend dashboard-summary       M      —      3         │
│  W-2     Plan draft panel               L      W-1    2         │
│  …                                                              │
│  Sizing issues: 1 row highlighted                               │
├─────────────────────────────────────────────────────────────────┤
│ PHASE RECOMMENDATION                                            │
│  Suggested: Phase 111 (current workspace phase 110 active)      │
├─────────────────────────────────────────────────────────────────┤
│  [ Re-run review ]   [ Accept plan… ]  (enabled: warnings only) │
└─────────────────────────────────────────────────────────────────┘
```

**Blocked variant:** Accept disabled; banner:

```text
│ ✕ Review blocked — 3 blocker(s). Fix artifact or edit WBS.      │
│   RUBRIC-COV-GOAL  Coverage map missing for goal G-2            │
```

Use **icon + text** for severity (not color-only — see §10).

---

## 5. State: Accept (policy drawer)

```text
┌─ Accept plan ───────────────────────────────────────────────────┐
│ Version to approve: 3                                             │
│ Review: passed (2 warnings acknowledged)                          │
│                                                                   │
│ Policy approval required (Tier B)                                 │
│  [x] I confirm this plan scope for phase execution                │
│  Rationale: ________________________________                      │
│                                                                   │
│  [ Cancel ]              [ Accept plan ]                        │
└───────────────────────────────────────────────────────────────────┘
```

**Command:** `accept-plan-artifact` with `policyApproval` + `approvedVersion: 3`.

**Error toast:** `plan-artifact-version-mismatch` → prompt refresh summary.

---

## 6. State: Finalize — task creation preview (dry-run)

```text
┌─ Plan lifecycle ────────────────────────────────────────────────┐
│ ✓ Accepted   v3   by operator@…   2026-05-27                    │
├─────────────────────────────────────────────────────────────────┤
│ FINALIZE TO PHASE                                               │
│  Target phase: [ 111 ▼ ]  (default from recommendation)         │
│                                                                   │
│ TASK CREATION PREVIEW (dry-run)                    12 tasks      │
│  T-new   Plan draft panel (renderer)        ready   P1          │
│  T-new   Review findings UI                 ready   P1   dep W-2  │
│  …                                                              │
│  Task-level review: ✓ passed (ux-cae-pre-persist-v1)              │
├─────────────────────────────────────────────────────────────────┤
│  [ Preview again ]     [ Persist tasks to phase ]                 │
└─────────────────────────────────────────────────────────────────┘
```

**Persist:** opens policy drawer (same pattern as Accept) → `finalize-plan-to-phase` `dryRun: false`.

**Post-persist:** success banner + link **View in Queue**; refresh shows created task ids.

---

## 7. State: Finalized / created tasks

```text
┌─ Plan lifecycle ────────────────────────────────────────────────┐
│ ✓ Finalized → Phase 111   12 tasks created                      │
│  planRef: planning:plan-artifact:…                              │
├─────────────────────────────────────────────────────────────────┤
│ CREATED TASKS                                                   │
│  T100501  Extend dashboard-summary        ready                 │
│  T100502  Plan draft panel                ready                 │
│  [ Open queue filtered by planRef ]                             │
└─────────────────────────────────────────────────────────────────┘
```

---

## 8. Error states

| Code | UI treatment |
| --- | --- |
| `plan-artifact-schema-invalid` | Inline list of schema paths; link to CLI draft command |
| `plan-artifact-review-blocked` | Findings panel + disabled Accept |
| `plan-artifact-not-accepted` | Finalize hidden; CTA "Accept plan first" |
| `plan-artifact-finalize-review-failed` | Preview table with failed rows highlighted |
| `policy-denied` | Policy drawer validation message |
| `planning-generation-mismatch` | Full-panel soft refresh prompt |
| Network / CLI failure | Existing dashboard error strip + retry |

```text
┌─ Error ─────────────────────────────────────────┐
│ ✕ Finalize blocked: task review failed          │
│   Row W-7: acceptance criteria too vague          │
│   [ Edit plan via CLI ]  [ Dismiss ]              │
└───────────────────────────────────────────────────┘
```

---

## 9. Coexistence with build-plan wizard

```text
┌─ Guided planning (legacy) ──────────────────────┐
│ Resume interview: Step 4 of 8                     │
│ Prefer a full phase plan? Use Plan lifecycle ↑    │
│  [ Continue wizard ]  [ Start PlanArtifact draft ]│
└───────────────────────────────────────────────────┘
```

Per **A-COMPAT**: wizard stays; copy steers serious plans to Plan lifecycle panel.

---

## 10. Accessibility

| Requirement | Mockup binding |
| --- | --- |
| **Not color-only** | Blockers: `✕` + label "Blocker"; warnings: `⚠` + "Warning"; pass: `✓` + "Passed". |
| **Focus order** | Status strip → open questions → findings → WBS table → primary action. |
| **Keyboard** | Accept/Finalize open drawers trap focus; Esc closes. |
| **Screen reader** | `aria-live="polite"` on review completion; table headers on WBS preview. |
| **Contrast** | Use VS Code theme tokens (`var(--vscode-*)`); no custom red/green-only badges. |
| **Touch / narrow** | Buttons min 44px; table horizontal scroll with sticky first column. |

---

## 11. `planArtifact` summary contract (T-7.1 preview)

```json
{
  "planId": "uuid",
  "version": 3,
  "status": "draft | in_review | accepted | finalized",
  "planRef": "planning:…",
  "completenessScore": 0.82,
  "openQuestionCount": 2,
  "reviewPassed": null,
  "reviewBlockerCount": 0,
  "reviewWarningCount": 0,
  "wbsRowCount": 12,
  "sizingFindingCount": 1,
  "phaseRecommendation": { "phaseKey": "111", "rationale": "…" },
  "approvalRecord": null
}
```

Null `planArtifact` when no draft — panel shows empty state:

```text
│ No active plan artifact.                                        │
│  [ Draft from CLI ]  [ Learn: PlanArtifact workflow ]           │
```

---

## 12. Component map (implementation hint)

| Mockup section | Extension target (WP-7) |
| --- | --- |
| Status strip | `PlanLifecycleHeader.tsx` (new) |
| Open questions | `PlanOpenQuestions.tsx` |
| Findings | `PlanReviewFindings.tsx` |
| WBS table | `PlanWbsPreviewTable.tsx` |
| Accept drawer | reuse policy drawer pattern from task actions |
| Finalize preview | `PlanFinalizePreview.tsx` |

Styleguide: existing dashboard webview CSS modules; no new brand palette.

---

## 13. Exit criteria (**A-UX**)

- [x] Maintainer signs off layout and state flow (this doc or linked Figma).
- [ ] **A-COMPAT** dual-surface copy approved (§9).
- [ ] T-7.1 contract fields confirmed against §11.
- [ ] WP-7 UI tasks (T-7.1–T-7.5) may start after sign-off.

---

## 14. References

| Resource | Purpose |
| --- | --- |
| [`PLANNER.md`](./PLANNER.md) | Step 7 dashboard surfaces |
| [`PLANNER_ARCHITECTURE.md`](./PLANNER_ARCHITECTURE.md) | §5 dashboard integration |
| [`PLANNER_TEST_STRATEGY.md`](./PLANNER_TEST_STRATEGY.md) | Extension render tests |
| `extensions/cursor-workflow-cannon/src/views/dashboard/` | Current dashboard code |

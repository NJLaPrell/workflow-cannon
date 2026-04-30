# REF-005 — Split `modules/planning/index.ts`

| Field | Value |
| --- | --- |
| **Proposal ID** | REF-005 |
| **Suggested `type`** | `improvement` |
| **Primary paths** | `src/modules/planning/index.ts`, `src/modules/planning/question-engine.ts`, `src/modules/planning/artifact.ts`, `src/core/planning/index.ts` |

---

## Problem statement

`modules/planning/index.ts` is **large** (~900+ lines): it combines **guided interview plumbing**, **`build-plan`** output modes, task/wishlist **materialization**, and **policy hooks** tied to **`task-engine`**. That mix makes testing and edits **orthogonal concerns** collide.

---

## Goals

1. **Modularity:** Separate **routing**/`WorkflowModule` from **wishlist/tasks/response builders**.
2. **Maintainability:** `question-engine.ts` + `artifact.ts` alignment stays explicit; **`output-modes`** and **`execution-drafts`** in dedicated modules.
3. **Reliability:** **`build-plan`** JSON and **`planning` config** semantics unchanged (**`pnpm run test`** + schema-only **`wk run`** if applicable).

---

## Out of scope

- Rewriting **`nextPlanningQuestions`** UX or **`PLANNING_WORKFLOW_*`** enums without explicit product approval.
- Persisted planning store format (**task-engine**).

---

## Implementation plan

1. List **top-level helpers** inside `index.ts`: `resolveOutputMode`, `buildTasksFromExecutionDrafts`, `maxNumericTaskIdFromIds`, **`planningModule` factory internals**.
2. Move **pure helpers** → `planning/plan-output.ts`, `planning/execution-draft.ts`, `planning/task-id-utils.ts` (names negotiable).
3. Keep **`planningModule`** export in **`index.ts`** assembling **`onCommand`** delegates.
4. Ensure imports use **`core/planning`** façade as today — **avoid** importing deep **`modules/task-engine`** paths from planning except where already approved by **`src/README.md`**.
5. Update **`builtinInstructionEntriesForModule`** usage only if file paths move (usually unchanged).

---

## Task links

| Link | Purpose |
| --- | --- |
| **`core/planning/index.ts`** | Stable façade imports — keep planning module importing through here |
| **REF-001** | If `build-plan` touches shared helpers duplicated in task-engine, dedupe cautiously |

---

## Acceptance criteria

- [ ] `modules/planning/index.ts` is **thin** (registration + composition); helper files bear most lines.
- [ ] **`pnpm run build`** / **`pnpm run test`** pass.
- [ ] **`build-plan`** instruction (`src/modules/planning/instructions/build-plan.md`) still matches code paths (examples).
- [ ] No new **disallowed** sibling imports (respect **REF-004**).

---

## create-task payload (starter)

```json
{
  "id": "T###",
  "title": "[REF-005] Split planning module index.ts into focused modules",
  "status": "proposed",
  "type": "improvement",
  "technicalScope": [
    "Extract helpers from modules/planning/index.ts into plan-output.ts, execution-draft.ts, etc.",
    "Keep WorkflowModule wiring in index.ts.",
    "Verify build-plan behavior and tests."
  ],
  "acceptanceCriteria": [
    "Thin index.ts; cohesive files by concern.",
    "Tests green; no intentional planning JSON contract regressions.",
    "Instructions/docstrings aligned with extracted structure."
  ],
  "metadata": {
    "issue": "planning/index.ts couples interview routing with heavy task drafting logic.",
    "supportingReasoning": "Large file count and coupling to task-engine policy complicate phased changes.",
    "evidenceRefs": ["tasks/refactor-proposals/REF-005-split-planning-module.md"]
  }
}
```

---

## Risk & rollback

- **Risk:** Accidental **`expectedPlanningGeneration`** drift — unchanged tests + manual **`review-planning-execution-drafts`** schema-only smoke if touching that path.
- **Rollback:** Revert extraction PR(s).

# REF-004 — Enforce module boundaries (Sibling imports / ports)

| Field | Value |
| --- | --- |
| **Proposal ID** | REF-004 |
| **Suggested `type`** | `improvement` |
| **Canonical rule** | `src/README.md` — modules depend on **`core`** + **`contracts`**; **`core/planning`** is an approved façade over task-engine |
| **Known smell** | e.g. `src/modules/task-engine/apply-task-batch-command.ts` → `../skills/task-skill-validation` |

---

## Problem statement

**Documented** dependency rules prohibit **sibling `modules/*` imports**, but exceptions exist ad hoc. That **couples release cadences** (task-engine ↔ skills), **hides cycles**, and defeats the goal of **`core/planning`** as a façade.

---

## Goals

1. **Reliability:** No **surprise transitive** imports between capability modules during refactors.
2. **Maintainability:** **One** place (`core/` or **`contracts/`**) owns cross-cutting interfaces.
3. **Efficiency:** Optional **eslint**/`tsc`/custom script **`check-module-boundaries`** in CI to prevent regression.

---

## Implementation plan

1. **`rg 'from "\\.\\.\\/[a-z-]+/\"'`** under `src/modules` (tune regex) — or maintain explicit **allowlist** in script — list violators.
2. For **`task-skills-validation`**: move **pure validation** to **`src/core/skills/task-skill-validation.ts`** (or **`contracts`** if types-only), re-export from **skills module** for backward compat OR update imports once.
3. Repeat for any other **`modules/foo` → `modules/bar`** edges.
4. Add **CI gate**: script fails on new violations (**allowlist** for approved `core/planning` re-exports only from designated files).
5. Update **`.ai/module-build.md`** / **`src/README.md`** exception list **only if** new approved façade paths are introduced.

---

## Task links

| Link | Purpose |
| --- | --- |
| **`REF-001`** | Easier decomposition when task-engine drops direct skills import |
| **`core/planning/index.ts`** | Pattern for façade over task-engine internals |

---

## Acceptance criteria

- [ ] **`rg`** / gate reports **zero** forbidden sibling imports **or** an explicit **`allowlist`** with rationale per entry.
- [ ] **`pnpm run build`** and **`pnpm run test`** pass.
- [ ] **`skills` module** still exposes any **required** runtime API for callers that previously reached through deep paths (**export map** clarified in `modules/skills/index.ts` if needed).
- [ ] **Documentation**: `src/README.md` “exceptions” subsection updated.

---

## create-task payload (starter)

```json
{
  "id": "T###",
  "title": "[REF-004] Enforce module boundaries + move cross-cutting validation to core",
  "status": "proposed",
  "type": "improvement",
  "technicalScope": [
    "Inventory modules/* sibling imports; relocate shared logic to core or contracts.",
    "Introduce CI script or lint rule preventing new sibling imports.",
    "Update README/module-build exception list."
  ],
  "acceptanceCriteria": [
    "No unauthorized sibling imports; gate in CI.",
    "Build + tests green.",
    "Public API for skills validation documented if re-export paths change."
  ],
  "metadata": {
    "issue": "Task-engine imports skills validation — violates stated module layering.",
    "supportingReasoning": "grep + src/README documented rules; refactoring megamodules is harder with hidden edges.",
    "evidenceRefs": ["tasks/refactor-proposals/REF-004-enforce-module-boundaries.md", "src/modules/task-engine/apply-task-batch-command.ts"]
  }
}
```

---

## Risk & rollback

- **Risk:** **Circular** **`core`** import if validation pulls module types incorrectly — extract **pure** functions + minimal types first.
- **Rollback:** Restore imports; CI script opt-out temporarily.

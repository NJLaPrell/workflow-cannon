# REF-006 — Restructure `core/cae/` into subfolders

| Field | Value |
| --- | --- |
| **Proposal ID** | REF-006 |
| **Suggested `type`** | `improvement` |
| **Primary paths** | `src/core/cae/` (multiple 300–850 line files) |

---

## Problem statement

**CAE** capabilities live under a **flat-ish** folder with **many peers** (`cae-registry-*.ts`, `cae-kit-sqlite.ts`, `guidance-*.ts`, CLI admin). Navigation and **ownership** blur: new contributors grep rather than discovering **layers**.

---

## Goals

1. **Modularity:** Directories reflect **domains**: `registry/`, `persistence/` (kit sqlite), `evaluation/`, `guidance/`, `cli/` (_optional).
2. **Maintainability:** **Barrel files** (`cae/index.ts` or `cae/registry/index.ts`) re-export **stable** symbols so **external imports** can migrate gradually.
3. **Reliability:** **No behavioral change** — move-only refactor with **exact** re-export map.
4. **Efficiency:** Shorter onboarding path for CAE edits.

---

## Implementation plan

1. Freeze **public consumers** via **`grep "from .*core/cae/"`** across `src/`.
2. Create subfolders **without** renaming symbols initially (**re-export** from **`src/core/cae.ts`** shim **or** update imports in one sweep — repo style preference).
3. Preferred pattern consistent with codebase: **`ts` project references** unaffected if paths update with **`imports use .js`** suffix preserved.
4. Move files in **logical batches** (e.g. registry first, persistence second) merged as separate PRs to reduce blast radius.
5. Update **`imports`** in **`context-activation`** and **`cli/doctor-cae`** as paths shift.

---

## Task links

| Link | Purpose |
| --- | --- |
| **REF-002** | context-activation imports many `core/cae/*` — minimize churn by shims |
| **REF-003** | Persistence kernel overlaps `cae-kit-sqlite` |
| **`schemas/cae/**`** | Move only if tooling expects folder parity (optional consistency pass) |

---

## Acceptance criteria

- [ ] **All tests** + **`pnpm run build`** pass after each merged batch.
- [ ] **`grep`** shows **no orphan** imports to deleted paths.
- [ ] **`package.json` exports** unchanged for published surface (if **`core/cae`** re-exported at package boundary — verify `dist`).
- [ ] **`docs/`** untouched unless maintenance explicitly updates — **routing rule** prefers **`.ai/`** if doc touch needed.

---

## create-task payload (starter)

```json
{
  "id": "T###",
  "title": "[REF-006] Restructure core/cae into domain subfolders + re-exports",
  "status": "proposed",
  "type": "improvement",
  "technicalScope": [
    "Create core/cae subfolders (registry, persistence, evaluation, guidance); move files incrementally.",
    "Preserve behavior; use re-export shims during migration if needed.",
    "Update imports in cli and context-activation."
  ],
  "acceptanceCriteria": [
    "Build + tests green; no intentional CAE semantics change.",
    "Import paths consistent; no dangling references.",
    "Optional: documenting new layout in .ai/module-build or ARCHITECTURE via machine canon path only if required."
  ],
  "metadata": {
    "issue": "core/cae is hard to navigate; domain boundaries unclear in flat listing.",
    "supportingReasoning": "Many medium/large peers; refactoring benefits from cohesive subpackages.",
    "evidenceRefs": ["tasks/refactor-proposals/REF-006-cae-subpackage-layout.md"],
    "links": { "relatedProposalIds": ["REF-003", "REF-002"] }
  }
}
```

---

## Risk & rollback

- **Risk:** **Case-sensitive** filesystems / CI mismatches — use **`git mv`**, verify Linux CI.
- **Rollback:** **`git revert`** batch PR.

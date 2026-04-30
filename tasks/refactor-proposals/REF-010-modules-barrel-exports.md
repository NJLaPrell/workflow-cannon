# REF-010 — Narrow `modules/index.ts` barrel and package exports policy

| Field | Value |
| --- | --- |
| **Proposal ID** | REF-010 |
| **Suggested `type`** | `improvement` |
| **Primary paths** | `src/modules/index.ts`, root **`package.json` → `"exports"`** |

---

## Problem statement

**`src/modules/index.ts`** **re-export** many **`task-engine`**, **`improvement`**, and **`agent-behavior`** symbols for library consumers and internal convenience. Wide barrels **inflate public API surface** **accidentally**, complicate tree-shaking, and obscure **semver** commitments.

---

## Goals

1. **Modularity:** **Explicit** `package.json` **exports map** listing **stable** programmatic entrypoints (already partially exists for **`contracts/*`** — extend thoughtfully).
2. **Maintainability:** **`defaultRegistryModules`** remains **the** curated bundle export; submodule deep exports (**opt-in**) via **`./modules/task-engine`** style **only if tsconfig paths** verified.
3. **Reliability:** **Semver clarity** — document what is **semver-stable** vs **internal**.
4. **Efficiency:** Faster resolution for dependents that import **narrow shapes**.

---

## Out of scope (unless semver major approved)

- **Removing** symbols without **deprecation** cycle (**CHANGELOG**, release notes).

---

## Implementation plan

1. **Inventory** **`import`** from **`@workflow-cannon/workspace-kit`** usage **outside** repo (npm consumers) — if unknown, grep **published** dependents or **`npm pack`** dry-run + **semver** cautious approach.
2. Classify **`modules/index.ts` exports:**
   - **Tier 1**: keep as **published** (**`taskEngineModule`**, **`defaultRegistryModules`**, key **`types`** used by embeddings).
   - **Tier 2**: **move** to **`package exports`** subpaths (`./dist/modules/task-engine/index.js`).
   - **Tier 3**: **internal-only** — remove from barrels, keep **deep import** for in-repo (**tsconfig paths** unchanged).
3. **`package.json` exports** additive first (**minor**) — removals only **`major`** (**RELEASING** checklist).
4. Document in **`.ai/module-build.md`** or **changelog** excerpt (**machine canon** routing).

---

## Task links

| Link | Purpose |
| --- | --- |
| **`REF-008`** | Config façade exports interplay |
| **`src/modules/README.md`** | Human table — mirror **not** authoritative for agents (**per routing**) — `.ai/` if machine doc needed |

---

## Acceptance criteria

- [ ] **Published exports** enumerated in **`package.json`** (**fields** correctness verified **`pnpm pack --dry-run`** or equivalent maintainer checklist).
- [ ] **`pnpm run build`** + **`pnpm run test`** pass.
- [ ] **CHANGELOG / RELEASING** note if externally visible removals (**deprecation shim** mandatory first).
- [ ] **`defaultRegistryModules`** still importable with **same** ergonomics (`src/modules/index.ts` remains entry for **embedding** **`workspace-kit`** as library).

---

## create-task payload (starter)

```json
{
  "id": "T###",
  "title": "[REF-010] Define narrow package exports vs modules barrel re-exports",
  "status": "proposed",
  "type": "improvement",
  "technicalScope": [
    "Audit consumers of workspace-kit programmatic exports.",
    "Add package.json exports subpaths incrementally; deprecate barrel symbols if needed.",
    "Document semver policy for programmatic API."
  ],
  "acceptanceCriteria": [
    "Clear stable vs internal API stance; deprecation before removal.",
    "Build/test green; CHANGELOG communicates external impact.",
    "defaultRegistryModules remains discoverable entry."
  ],
  "metadata": {
    "issue": "Wide modules/index barrel blurs semver and forces accidental coupling for consumers.",
    "supportingReasoning": "package.json already lists selective contract exports — extend pattern intentionally.",
    "evidenceRefs": ["tasks/refactor-proposals/REF-010-modules-barrel-exports.md", "package.json"],
    "links": { "relatedProposalIds": ["REF-008"] }
  }
}
```

---

## Risk & rollback

- **Risk:** **Break downstream** packages silently — mitigate with **`exports` compat** shim paths during deprecation window (**two minors** preferred).
- **Rollback:** **`git revert`** + **republish**.

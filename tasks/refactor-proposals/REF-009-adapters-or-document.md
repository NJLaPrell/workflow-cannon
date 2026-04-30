# REF-009 — Resolve `adapters/` vs persistence reality

| Field | Value |
| --- | --- |
| **Proposal ID** | REF-009 |
| **Suggested `type`** | `improvement` |
| **Primary paths** | `src/adapters/index.ts`, `src/core/state/*`, `src/modules/task-engine/persistence/*` |

---

## Problem statement

`src/README.md` promises **`adapters/`** for sqlite/filesystem integration, but **`src/adapters/index.ts`** only exposes a **stub type** (**`AdapterVersion`**). Actual **SQLite** access lives under **`core/state`** and **task-engine**. New contributors waste time looking for adapters that do not exist **or assume** isolation that is not enforced.

---

## Goals (pick one coherent direction — documented in acceptance)

### Direction A — **Elevate adapters** (preferred if swappability matters)

1. Introduce **`adapters/sqlite/`** exposing narrow interfaces (**`PlanningDb`**, **`KitDb`**).
2. **`core/state`** delegates to adapters; **tests** may inject **in-memory** fakes (**long-term** reliability win).

### Direction B — **Retire adapters folder** / **rename** to **`src/integrations/`**

1. Fold stub into **`core`** or **`contracts`** README note.
2. Update **`src/README.md`** layering diagram (**accuracy**).

### Direction C — **Hybrid (minimal)**

1. **`adapters/index.ts`** re-exports **actual** façade from **`REF-003`** kernel without physical move (**transition** shim only).

---

## Out of scope

- Changing **SQLite** backing store product choice (**still default** **`better-sqlite3`** unless separate approved project).

---

## Implementation plan

1. **Decision record** (**ADR-sized** bullet in **`src/README.md`** or **`.ai/adrs`** if one exists machine-side — comply with **`agent-doc-routing`** for where ADR lands).
2. Execute **Direction A or B or C** in **one focused PR**.
3. If **Direction A:** start with **`interface`** + **`move`** `open*` functions **behind adapter** (**REF-003** dependency strong).

---

## Task links

| Link | Purpose |
| --- | --- |
| **REF-003** | Kernel extraction before real adapter seams |
| **`test/` fixtures** | Prefer adapter fakes feeding tests once interfaces exist |

---

## Acceptance criteria

- [ ] **README / `.ai`** (per routing) accurately describes persistence layout — **no false `adapters/` promise** unless implemented.
- [ ] **`pnpm run build`** + **`pnpm run test`** pass.
- [ ] **Direction chosen** spelled in PR **`body`** (**A/B/C**).
- [ ] If **Direction A**, at least **`one`** callsite migrated with **parity** proven by tests (**no double-open regressions — REF-003**).

---

## create-task payload (starter)

```json
{
  "id": "T###",
  "title": "[REF-009] Align adapters/ folder with SQLite integration reality",
  "status": "proposed",
  "type": "improvement",
  "technicalScope": [
    "Choose adapters vs readme-only layering; implement minimal seam or retire stub.",
    "Coordinate with REF-003 kernel if extracting DB open behind interface.",
    "Update machine-oriented docs/README under src/"
  ],
  "acceptanceCriteria": [
    "Contributor-facing layering description matches code.",
    "Tests/build green.",
    "Clear ADR/note for chosen direction A/B/C."
  ],
  "metadata": {
    "issue": "adapters/index.ts stub contradicts README promise; persistence lives elsewhere.",
    "supportingReasoning": "README claims adapters/fs/sqlite separation; codebase shows otherwise.",
    "evidenceRefs": ["tasks/refactor-proposals/REF-009-adapters-or-document.md", "src/README.md", "src/adapters/index.ts"],
    "links": { "dependsOnProposalIds": ["REF-003"] }
  }
}
```

---

## Risk & rollback

- **Risk:** **Over-abstraction** without second implementation — mitigate by **narrow interface** (**YAGNI** until second backend).
- **Rollback:** **`git revert`**.

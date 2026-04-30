# REF-003 — Unify kit SQLite / planning persistence layer

| Field | Value |
| --- | --- |
| **Proposal ID** | REF-003 |
| **Suggested `type`** | `improvement` (may need **human approval** if migration path semantics change — see PRINCIPLES) |
| **Primary paths** | `src/core/state/workspace-kit-sqlite.ts`, `src/modules/task-engine/persistence/sqlite-dual-planning.ts`, `src/core/cae/cae-kit-sqlite.ts`, `src/core/state/unified-state-db.ts` |

---

## Problem statement

**Planning** and **CAE** both use **SQLite** with **versioning**, **migrations**, and **operational** concerns (backup, doctor, readiness). Logic is split across **`core/state`**, **`core/cae`**, and **`task-engine/persistence`**, increasing **drift risk** (two migration styles, duplicated “open DB” patterns) and making **correctness under upgrade** harder to audit.

---

## Goals

1. **Modularity:** A clear **internal API** for “open kit planning DB”, “migrate”, “read user_version”, “dual store view” consumed by task-engine + CAE.
2. **Reliability:** Single **source of truth** for **KIT_SQLITE_USER_VERSION** (and related) migration sequencing; fewer places to forget a PRAGMA or backup hook.
3. **Efficiency:** Less copy-paste for new features that touch the same file on disk (**`.workspace-kit` paths** unchanged).
4. **Maintainability:** Files ≤ **~400–500 lines** per concern (schema DDL vs migrations vs dual-store orchestration), or documented exception.

---

## Out of scope (initial phase)

- Changing **default DB path** or **user-facing** persistence opt-out semantics (JSON store) unless explicitly approved.
- Broad **CAE** rule engine changes.

---

## Implementation plan (incremental — required per PRINCIPLES)

### Phase A — Inventory (no behavior change)

1. Document **call graph**: who opens SQLite, who migrates, who reads **`user_version`**.
2. List **duplicate** helpers (exists checks, pragma, journal mode if any).

### Phase B — Extract shared kernel

1. Introduce **`src/core/state/kit-sqlite/`** (name TBD): **`open.ts`**, **`migrate.ts`**, **`constants.ts`** (table names kept export-stable from current modules).
2. **Re-export** from **old paths** (`workspace-kit-sqlite.ts` re-exports) for **compatibility** — follow existing repo pattern for stable imports.

### Phase C — Dual-store + CAE

1. Move **dual planning** orchestration helpers that are DB-generic into kernel or **`task-engine/persistence/sqlite-dual-planning.ts`** only after kernel exists.
2. **`cae-kit-sqlite.ts`**: prefer **injecting** open from kernel or thin wrapper — **no** double-open of same path.

### Phase D — Cleanup

1. Remove dead code paths after re-export stabilization period (optional second PR).

---

## Task links

| Link | Purpose |
| --- | --- |
| `REF-001`, `REF-002` | May touch imports after kernel lands — sequence after or coordinate |
| `REF-004` | Ports for non-SQLite concerns stay out of DB kernel |
| **`scripts/check-*`** | If any script assumes file layout, update in same change |

---

## Acceptance criteria

- [ ] **All existing tests** pass; **`pnpm run check-compatibility`** / **`parity`** as required by maintainers for persistence-adjacent change.
- [ ] **`user_version`** bump policy documented in **one** place (comment + ADR touch if needed).
- [ ] **No regression** in **`wk doctor`** planning / CAE sections (spot-check output keys).
- [ ] **Export paths:** Either unchanged for external consumers of `workspace-kit` package, or **changelog** + **minor** version note per **RELEASING** process.
- [ ] Roll-forward **migration** path verified on a **copy** of a real-ish DB fixture if available in **`test/fixtures`**.

---

## create-task payload (starter)

```json
{
  "id": "T###",
  "title": "[REF-003] Unify kit SQLite / planning persistence kernel",
  "status": "proposed",
  "type": "improvement",
  "technicalScope": [
    "Introduce core/state kit-sqlite kernel (open, migrate, constants) incrementally.",
    "Re-export from workspace-kit-sqlite.ts and converge cae-kit / dual-planning callers.",
    "Preserve DB paths and migration outcomes; extend tests/fixtures."
  ],
  "acceptanceCriteria": [
    "Doctor + readiness flows still pass; parity/compatibility gates per RELEASING.",
    "Single documented user_version bump story.",
    "No silent behavior change — migration notes if any observable CLI output shifts."
  ],
  "risk": "high",
  "metadata": {
    "issue": "SQLite planning persistence split across core/state, cae-kit, task-engine persistence risks drift and migration bugs.",
    "supportingReasoning": "Multiple large files manage overlapping concerns (schema, dual store, CAE traces).",
    "evidenceRefs": ["tasks/refactor-proposals/REF-003-unify-planning-sqlite-layer.md"],
    "proposedSolutions": ["Phased extraction with compatibility re-exports", "Fixture-backed migration tests"],
    "links": { "dependsOnProposalIds": ["REF-004"], "optionalAfter": ["REF-009"] }
  }
}
```

---

## Risk & rollback

- **Risk:** Migration order change ⇒ corrupted or empty reads. Mitigate with **backup** hooks unchanged and **fixture** tests.
- **Rollback:** Revert commits; prefer **many small PRs** behind compatibility shims.

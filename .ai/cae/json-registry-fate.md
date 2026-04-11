# Fate of `.ai/cae/registry/*.json` (Phase 70)

**Task:** **T908** / **CAE_PLAN** Epic 7 G3.

## Decision

- **Runtime authority:** kit SQLite active **`cae_registry_*`** version only (**`kit.cae.registryStore`** default **`sqlite`**).
- **JSON files under `.ai/cae/registry/`:** retained as **migration seed**, **CI/check seed** (`scripts/check-cae-registry.mjs`), and **developer/test fixtures**. They are **not** the runtime source of truth.
- **Editing:** changing seed JSON still flows through **git + PR** like other repo config; operators must run **`cae-import-json-registry`** (or rely on check-stage seed) to refresh SQLite when needed.

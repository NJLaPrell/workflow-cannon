# Phase 70 — CAE SQLite registry task tracker

Machine-oriented continuity after a local **`git restore .workspace-kit/tasks/workspace-kit.db`** (or any fresh kit DB) dropped in-flight **`T887+`** rows. These IDs were **re-created** in the task store (`create-task` + `run-transition`) on **2026-04-10** with **`clientMutationId` `cae-restore-*`** metadata where applicable.

| Task   | CAE_PLAN / scope | Task store status | Repo evidence |
| ------ | ---------------- | ----------------- | ------------- |
| **T887** | Epic 1 — registry DDL + migration ladder | `completed` | `src/core/state/workspace-kit-sqlite.ts` (`CAE_REGISTRY_DDL`, v11→v12) |
| **T888** | Epic 1 — `cae-kit-sqlite` registry row helpers | `completed` | `src/core/cae/cae-kit-sqlite.ts`, `test/cae-registry-db-helpers.test.mjs` |
| **T889** | Tests for registry DB helpers | `completed` | Same test file |
| **T890** | Epic 2 — `cae-registry-sqlite` loader + `replaceActiveCaeRegistryFromLoaded` | `completed` | `src/core/cae/cae-registry-sqlite.ts`, `test/cae-registry-sqlite.test.mjs` |
| **T891** | `loadRegistryForCae`, `cae-import-json-registry`, manifest/policy | `completed` | `src/modules/context-activation/index.ts`, manifest + waivers |
| **T892** | Epic 3 **C2** — import artifact path verification hardening | `ready` | Follow-up when import/loader gaps found |
| **T893** | Epic 3 **C3** — SQLite-only runtime (no JSON authority) | `completed` | Default `kit.cae.registryStore: sqlite`, `cae-registry-effective.ts`, `check-cae-registry.mjs` idempotent seed, kit DB carries active seed version |

**Operator note:** With **`registryStore: sqlite`** (default), **`cae-registry-validate`** reads the kit DB. **`scripts/check-cae-registry.mjs`** idempotently seeds from **`.ai/cae/registry/*.json`** when there is **no active** registry version so **`pnpm run check`** stays green without hand-running import first.

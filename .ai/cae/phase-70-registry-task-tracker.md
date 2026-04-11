# Phase 70 — CAE SQLite registry task tracker

Machine-oriented continuity after a local **`git restore .workspace-kit/tasks/workspace-kit.db`** (or any fresh kit DB) dropped in-flight **`T887+`** rows. These IDs were **re-created** in the task store (`create-task` + `run-transition`) on **2026-04-10** with **`clientMutationId` `cae-restore-*`** metadata where applicable.

| Task   | CAE_PLAN / scope | Task store status | Repo evidence |
| ------ | ---------------- | ----------------- | ------------- |
| **T887** | Epic 1 — registry DDL + migration ladder | `completed` | `src/core/state/workspace-kit-sqlite.ts` (`CAE_REGISTRY_DDL`, v11→v12) |
| **T888** | Epic 1 — `cae-kit-sqlite` registry row helpers | `completed` | `src/core/cae/cae-kit-sqlite.ts`, `test/cae-registry-db-helpers.test.mjs` |
| **T889** | Tests for registry DB helpers | `completed` | Same test file |
| **T890** | Epic 2 — `cae-registry-sqlite` loader + `replaceActiveCaeRegistryFromLoaded` | `completed` | `src/core/cae/cae-registry-sqlite.ts`, `test/cae-registry-sqlite.test.mjs` |
| **T891** | `loadRegistryForCae`, `cae-import-json-registry`, manifest/policy | `completed` | `src/modules/context-activation/index.ts`, manifest + waivers |
| **T892** | Epic 3 **C2** — import artifact path verification hardening | `completed` | `verifyCaeArtifactRefPathsExist` workspace containment + `cae-import-json-registry` explicit verify; **`test/cae-artifact-path-verify.test.mjs`** |
| **T893** | Epic 3 **C3** — SQLite-only runtime (no JSON authority) | `completed` | Default `kit.cae.registryStore: sqlite`, `cae-registry-effective.ts`, `check-cae-registry.mjs` idempotent seed, kit DB carries active seed version |

**Operator note:** With **`registryStore: sqlite`** (default), **`cae-registry-validate`** reads the kit DB. **`scripts/check-cae-registry.mjs`** idempotently seeds from **`.ai/cae/registry/*.json`** when there is **no active** registry version so **`pnpm run check`** stays green without hand-running import first.

## CAE_PLAN follow-on wave (`ready`, **`phaseKey` `70`**)

Created in task engine with goals, **`technicalScope`**, and **`acceptanceCriteria`**; **`metadata.caePlanRef`** points at **CAE_PLAN.md** sections. **`clientMutationId`**: **`cae-plan-enter-<id>-20260410`**.

| Task | CAE_PLAN | Title (abbrev.) |
| --- | --- | --- |
| **T894** | Epic 2 **B3** | Content-based registry digest |
| **T895** | Epic 4 **D1** | Artifact admin CLI (create / update / retire) |
| **T896** | Epic 4 **D2** | Activation admin CLI |
| **T897** | Epic 4 **D3** | Registry version management CLI |
| **T898** | Epic 4 **D4** | **`cae-validate-registry`** command |
| **T899** | Epic 4 **D5** | Evaluation stack regression on SQLite registry |
| **T900** | Epic 5 **E1** | CAE mutation governance model |
| **T901** | Epic 5 **E2** | CAE mutation manifest + router gates |
| **T902** | Epic 5 **E3** | CAE mutation audit fields |
| **T903** | Epic 6 **F1** | Preflight + evaluator + merge on SQLite registry |
| **T904** | Epic 6 **F2** | Enforcement lane + SQLite registry |
| **T905** | Epic 6 **F3** | Advisory instruction surface + SQLite registry |
| **T906** | Epic 7 **G1** | Rewrite CAE docs for SQLite authority |
| **T907** | Epic 7 **G2** | Remove JSON-authority language (docs sweep) |
| **T908** | Epic 7 **G3** | Decide JSON file fate (fixtures vs removal) |
| **T909** | Epic 8 **H1** | Migration tests (JSON → SQLite) |
| **T910** | Epic 8 **H2** | Loader tests (digest, malformed DB) |
| **T911** | Epic 8 **H3** | CLI CRUD tests |
| **T912** | Epic 8 **H4** | Evaluator regression tests |
| **T913** | Epic 8 **H5** | Governance tests |
| **T914** | Epic 8 **H6** | Health + doctor registry signals |

**Not re-created as new tasks** (already covered by **T887–T893**): Epic 1 **A1–A3**, Epic 2 **B1**, Epic 2 **B2** (partial), Epic 3 **C1–C3**.

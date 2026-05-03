# Architecture refactor proposals (pack REF-001–REF-010)

Spec artifacts under this directory hold **problem statements**, **implementation sketches**, **`create-task` JSON starters**, and **cross-links**. **Authoritative backlog rows** for these refactor lines live in **`workspace-kit`** (IDs below).

## Task-engine rows — **proposed**, **`type`: `improvement`**

Created **2026-04-29** with **`pnpm exec wk run apply-task-batch`** (batch **`tasks/refactor-proposals/apply-task-batch.json`**; **`planningGeneration`**: 1987 → 1988).

| REF | Proposal doc | Task ID |
| --- | --- | --- |
| REF-001 | [REF-001](./REF-001-decompose-task-engine-internal.md) | **T100007** |
| REF-002 | [REF-002](./REF-002-decompose-context-activation.md) | **T100008** |
| REF-003 | [REF-003](./REF-003-unify-planning-sqlite-layer.md) | **T100009** |
| REF-004 | [REF-004](./REF-004-enforce-module-boundaries.md) | **T100010** |
| REF-005 | [REF-005](./REF-005-split-planning-module.md) | **T100011** |
| REF-006 | [REF-006](./REF-006-cae-subpackage-layout.md) | **T100012** |
| REF-007 | [REF-007](./REF-007-cli-layering.md) | **T100013** |
| REF-008 | [REF-008](./REF-008-split-config-stack.md) | **T100014** |
| REF-009 | [REF-009](./REF-009-adapters-or-document.md) | **T100015** |
| REF-010 | [REF-010](./REF-010-modules-barrel-exports.md) | **T100016** |

**Evidence:** `pnpm exec wk run list-tasks '{"idPrefix":"T10000","limit":15}'`

## Phase 77 execution tasks (`ready`, **`metadata.executionWave`**: `phase-77-exec`)

Created **2026-04-29** for **actual implementation** (supersedes administrative completion on the earlier **`T100007`–`T100016`** rows).

| REF | Task ID |
| --- | --- |
| REF-001 | **T100017** |
| REF-002 | **T100018** |
| REF-003 | **T100019** (depends on **T100020**) |
| REF-004 | **T100020** |
| REF-005 | **T100021** |
| REF-006 | **T100022** (depends on **T100019**) |
| REF-007 | **T100023** |
| REF-008 | **T100024** |
| REF-009 | **T100025** (depends on **T100019**) |
| REF-010 | **T100026** (depends on **T100024**) |

**Evidence:** `pnpm exec wk run list-tasks '{"phaseKey":"77","status":"ready","metadataFilters":{"executionWave":"phase-77-exec"}}'`

## Index

| ID | Proposal | Depends on |
| --- | --- | --- |
| [REF-001](./REF-001-decompose-task-engine-internal.md) | Decompose `task-engine-internal.ts` | — |
| [REF-002](./REF-002-decompose-context-activation.md) | Decompose `context-activation/index.ts` | — |
| [REF-003](./REF-003-unify-planning-sqlite-layer.md) | Unify kit SQLite / planning persistence layer | REF-004 (recommended first) |
| [REF-004](./REF-004-enforce-module-boundaries.md) | Enforce module boundaries / skill validation port | — |
| [REF-005](./REF-005-split-planning-module.md) | Split `modules/planning/index.ts` | — |
| [REF-006](./REF-006-cae-subpackage-layout.md) | Restructure `core/cae/` into subfolders | REF-003 optional synergy |
| [REF-007](./REF-007-cli-layering.md) | Layer `cli.ts` / `run-command` / policy | — |
| [REF-008](./REF-008-split-config-stack.md) | Split config CLI / metadata / resolution | — |
| [REF-009](./REF-009-adapters-or-document.md) | Align `adapters/` with actual persistence boundaries | REF-003 |
| [REF-010](./REF-010-modules-barrel-exports.md) | Narrow `modules/index.ts` / package exports policy | REF-008 optional |

## Canonical links

- Module dependency rules (R102 facade exceptions): **`src/README.md`**, **`.ai/module-build.md`**
- Agent CLI / policy unchanged unless spec says so: **`.ai/AGENT-CLI-MAP.md`**, **`.ai/POLICY-APPROVAL.md`**

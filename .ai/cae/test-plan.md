# CAE test strategy & coverage plan (v1)

**Task:** **`T854`**. **Consumers:** **`T860`** (evaluator), **`T861`/`T862`** (CLI), **`T869`** (integration hardening). **Goal:** every owner can implement tests **without reinterpretation**.

## Directory layout (this repo)

| Area | Path | Role |
| --- | --- | --- |
| **Normative schemas** | `schemas/cae/*.json` | Single source for Ajv strict tests. |
| **Fixtures** | `fixtures/cae/**` | Valid/invalid JSON for schema + future golden vectors. |
| **Schema/unit tests** | `test/cae-*.test.mjs` | Node **`node:test`** + Ajv; no TypeScript build required for schema-only PRs. |
| **Evaluator golden tests** | `test/cae-evaluator*.test.mjs` (**`T860`**) | Pure functions: context + registry snapshot → bundle + trace. |
| **CLI smoke** | `test/**` or extension harness (**`T862`**) | Prefer **direct handler** calls; **spawn `pnpm exec wk run`** only for thin smoke (slow, flaky on env). |

## Test layers (required ordering)

1. **Schema gates** — every schema change updates **`fixtures/cae/**`** and extends **`test/cae-*-schema.test.mjs`** (already established for bundle, trace, CLI argv, etc.).
2. **Determinism** — same **`evaluationContext`** + same registry content hash ⇒ identical **`bundleId`**, **`traceId`**, and **`families`** ordering (**`T842`**/**`T843`**). **Required before `T866`** ships allowlisted blocks.
3. **Merge / precedence** — golden vectors cover **`T843`** examples (a)–(e) at minimum (**`T860`**).
4. **Shadow vs live** — assert **`evaluationPipelineMode`** + **`conflictShadowSummary.evalMode`** consistency; shadow never mutates stores (**`T848`**/**`T863`**).
5. **Enforcement allowlist** — table-driven tests for each **`enforcement-lane.md`** row once **`T866`** adds ids (**`T851`**).
6. **Migration** — SQLite **`user_version`** bumps for CAE tables (**`T845`**/**`T867`**) get idempotent **`prepareKitSqliteDatabase`** tests mirroring existing kit patterns.

## Golden vector catalog (initial ids)

Vectors are **input triples** `(registrySnapshotRef, evaluationContextFixture, evalMode)` → **expected** `bundleId` **or** full expected JSON under `fixtures/cae/golden/` (**`T860`** creates files).

| `vectorId` | Intent | Context fixture | Status |
| --- | --- | --- | --- |
| `cae.golden.minimal-live` | Empty families, live | `fixtures/cae/evaluation-context/valid/minimal.json` | **Planned** |
| `cae.golden.shadow-labels` | Shadow observation sidecar | custom | **Planned** |
| `cae.golden.precedence-a` | Policy beats think (**`T843`** a) | custom | **Planned** |

**Stability policy:** compare **full normalized JSON** for golden files (no OS absolute paths). Prefer **JCS** or sorted-key serialization matching **`T842`** for hashing fields only; golden **files** store canonical pretty JSON committed from CI.

## Snapshot vs hash

- **CI default:** **full JSON equality** on `bundle` + `trace` after normalizing **`resolvedAt`** if present (strip or freeze test clock).
- **Optional hash assert:** `bundleId` string equality is **necessary** but not sufficient — add at least one **structural** assertion per vector (`families.policy.length`, etc.).

## Risk map — blocks enforcement (`T866`) if untested

| Gap | Risk |
| --- | --- |
| No determinism test on real registry slice | Wrong **`bundleId`** → silent wrong enforcement target. |
| No shadow/live parity on same input | Operators see divergent traces. |
| No CLI argv round-trip | Agents copy-paste broken JSON (**`T847`**). |
| No migration downgrade test | Bricked workspaces on **`user_version`** skew. |

## CI gates (existing + CAE)

- **`pnpm run check`** — manifest, doc drift, principles snapshot.
- **`pnpm run test`** — must include all **`test/cae-*.test.mjs`** files (already picked up by `test/**/*.test.mjs` glob).

## Cross-references

- **`.ai/cae/cli-read-only.md`**, **`.ai/cae/shadow-mode.md`**, **`.ai/cae/enforcement-lane.md`**
- **`tasks/cae/specs/T869.md`**

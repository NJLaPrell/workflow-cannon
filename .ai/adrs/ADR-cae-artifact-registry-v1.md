# ADR: CAE artifact registry & ID conventions (v1)

## Status

Accepted — Phase 70 (**`T839`**). Normative schema: **`schemas/cae/registry-entry.v1.json`**. Reserved **`cognitive-map`** behavior is locked for alignment with **`T856`** (future cognitive-map contract).

## Context

The Context Activation Engine (**CAE**) references runbooks, playbooks, checklists, and policy docs **by stable ids** without inlining bodies in activation payloads (**`tasks/cae/CAE-PROGRAM-CONTEXT.md`**). Implementers need a **machine-validated** registry row shape so **`artifactId`** and **`artifactType`** can be checked **without reading TypeScript**.

Architecture boundaries: **`.ai/adrs/ADR-context-activation-engine-architecture-v1.md`**. Glossary: **`.ai/TERMS.md`** (**`activation_artifact`**, **`context_activation_engine`**).

## Decision — on-disk format (v1)

| Aspect | Choice |
| --- | --- |
| **Serialization** | **JSON** objects per entry (one file per entry **or** array manifest — both valid inputs to the same schema). |
| **Not v1** | YAML-only registries, opaque blobs under **`.workspace-kit/`** for PR-reviewable registry content. |
| **Canonical schema** | **`schemas/cae/registry-entry.v1.json`** (`$id` `https://workflow-cannon.dev/schemas/cae/registry-entry.v1.json`). |

**Manifest (optional):** A JSON array of entries is a **convenience bundle**; each element MUST validate independently against the same schema. Loaders MAY accept a directory of `*.json` entry files.

## Decision — global vs layered registries

| Layer | Role |
| --- | --- |
| **Kit default** | Shipped / repo-root defaults (paths decided in **`T857`** / bootstrap task). |
| **Workspace overlay** | Optional workspace-local entries that **merge** with defaults; **higher-precedence overlay wins** on **`artifactId` collision** (exact merge rules in **`T843`** / precedence tasks). |

v1 ADR **defines** layering; implementation lands in loader tasks (**`T858`**).

## Decision — `artifactId` conventions

- **Charset:** `a-z`, `0-9`, separators **`.`**, **`_`**, **`-`** only (see schema **`pattern`**).
- **Stability:** **Immutable** once published; use a **new id** plus optional **alias map** in documentation for renames (no automatic alias field in v1 schema — handle in loader/metadata tasks if needed).
- **Namespacing:** Prefer dotted segments (e.g. `cae.playbook.task-to-phase-branch`) to avoid collisions.

**Validation without code:** read **`artifactId`** against **`schemas/cae/registry-entry.v1.json`** → `properties.artifactId`.

## Decision — `artifactType` (v1 vs reserved)

**v1 enum** (normative schema): `runbook` \| `playbook` \| `checklist` \| `review-template` \| `reasoning-template` \| `policy-doc`.

**Reserved (not in v1 enum):** **`cognitive-map`** — program reserves the type for future use (**`CAE-PROGRAM-CONTEXT.md`**).

### Reserved `cognitive-map` — validator behavior (v1)

- **JSON Schema validation** against **`registry-entry.v1.json`**: **`cognitive-map` is not a legal `artifactType`** → a row claiming that type **fails** schema validation (same as any other out-of-enum value).
- **Loaders / CI (future):** MUST treat failed schema validation as **hard errors** for shipped registry paths unless explicitly in a **draft** namespace documented out-of-band.

This matches the **`T856`** contract direction: v1 does **not** accept cognitive-map rows as valid registry entries.

## Decision — `ref` (reference, not body)

- **`ref.path`:** Repo-relative path constrained to roots **`src/`**, **`docs/`**, **`tasks/`**, **`.ai/`** (see schema **`oneOf`** patterns). No **`..`** segments (rejected by pattern).
- **`ref.fragment`:** Optional slug for logical anchors inside the file; still **no inlined body**.

## Decision — examples & fixtures

Authoritative examples for tests and human review:

- **Valid:** `fixtures/cae/registry-entries/valid/*.json` (3 rows).
- **Invalid:** `fixtures/cae/registry-entries/invalid/*.json` (3 rows) — expected to **fail** `registry-entry.v1.json`.

## Consequences

- **`T840`** (activation definition schema) and **`T858`** (loader) can depend on a single normative entry schema.
- **`tasks/cae/artifacts/stub-registry-entry.schema.json`** redirects to the canonical schema (relative **`$ref`**) for backward navigation from CAE stubs.

## References

- **`.ai/adrs/ADR-context-activation-engine-architecture-v1.md`**
- **`tasks/cae/CAE-PROGRAM-CONTEXT.md`**
- **`schemas/cae/registry-entry.v1.json`**

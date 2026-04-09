# ADR: CAE persistence & migration (v1)

## Status

Accepted — Phase 70 (**`T845`**). **DDL application** and adapters ship in **`T867`**; this ADR is the contract those implementations must follow.

## Context

The Context Activation Engine (**CAE**) produces **traces**, **shadow/compare** observations, optional **acknowledgement** satisfaction (**`T844`** / **`T867`**), and **registry/context hashes** for deterministic replay. We must decide **what is stored**, **where**, **retention**, and how that coexists with the existing unified **`workspace-kit.db`** and **`PRAGMA user_version`** migration ladder (**`src/core/state/workspace-kit-sqlite.ts`**).

**Reconciliation with `T846`:** trace and explain payloads can be **large** (paths, merge steps, candidate lists). Persisting **full** traces by default would bloat disk and increase leakage risk. **`T846`** will normative-size payloads and redaction; this ADR pins **storage posture** so **`T846`**/**`T867`** do not fight.

## Decision — store location (no parallel `cae.sqlite` in v1)

1. **Co-locate** CAE relational state in the **same SQLite file** as the task engine / planning store (**`tasks.sqliteDatabaseRelativePath`** → default **`.workspace-kit/tasks/workspace-kit.db`**).
2. **Do not** introduce a separate **`cae.sqlite`** for v1. If a future phase proves CAE I/O isolation is required (multi-GB retention, distinct backup SLAs), a **new ADR** must justify a split and migration/export tooling.
3. New CAE tables are added only via the **central kit migration chain** (increment **`KIT_SQLITE_USER_VERSION`** and a **`migrateV10ToV11`**-style step when **`T867`** lands). **No** ad-hoc `CREATE TABLE` from operators or extensions.

## Decision — v1 default: traces are ephemeral; persistence adapter may no-op

| Artifact | v1 default | When persistence is enabled (`kit.cae.persistence` / `T867`) |
| --- | --- | --- |
| **Trace bodies / event streams** | **Ephemeral** (memory/session). | Store **trimmed** events per **`T846`** limits: prefer **hashes**, **stable ids**, **counts**, and **redacted** paths — not full instruction bodies or raw evaluation blobs. |
| **Shadow runs / compare metrics** | Ephemeral unless operator enables retention. | Table **`cae_shadow_runs`** (see sketch): run id, timestamps, **eval mode**, **summary JSON** (bounded size), optional **`usefulness_rating`** (**nullable** — only when UX captures it). |
| **Ack satisfaction** | Session-scoped (**`T844`**). | Table **`cae_ack_satisfaction`**: `(trace_id, ack_token, activation_id, satisfied_at, actor, machine_checkable, evidence_ref)` — exact columns **`T867`**. |
| **Registry / context anchors** | Hashes only when a persisted trace row exists. | Table **`cae_evaluation_anchors`**: `trace_id`, `registry_content_hash`, `evaluation_context_hash`, `bundle_id`, `created_at` — supports deterministic replay without storing full context. |

**No-op persistence adapter:** When CAE persistence is **off**, **`T867`** implements an adapter that **drops** trace/shadow writes (success no-ops) and keeps **session** ack state only — matching **`T844`**.

## Decision — retention

- **Defaults:** bounded **row count** and/or **age** per table family (e.g. shadow runs **7d** or **10k** rows, whichever stricter); trace-derived rows inherit **`T846`** truncation + retention **together** (small rows, shorter TTL acceptable).
- **Overrides:** workspace config keys (exact names **`T867`**) — env-only overrides allowed for maintainers; **no silent unlimited growth**.
- **Pruning:** **best-effort background prune** on kit open or post-write; **doctor** may report **approximate** row counts / oldest row age (see below).

## Decision — threat notes & redaction

- **Path and secret leakage:** persisted CAE rows **must not** store **secrets**, **tokens**, or **raw `policyApproval`** payloads. Workspace paths appear only under **`T846`** redaction rules (hashed segments or repo-relative where safe).
- **Replay poisoning:** **anchors** tie persisted summaries to **registry hash** + **evaluation context hash**; loaders **must** reject or mark **stale** when hashes disagree with current registry (**`T867`** behavior).
- **Cross-tenant / multi-workspace:** a single DB file is **one workspace**; no ADR change for multi-tenant hosting (out of scope).

## Decision — doctor / health expectations

When CAE persistence is **enabled** (post-**`T867`**):

- **Doctor** (or CAE health hook) should surface **non-fatal** signals: persistence on/off, **approximate** CAE table row counts, **last prune** timestamp if tracked, and **user_version** ≥ CAE migration floor.
- **Failures** (missing tables when persistence expected, schema drift) are **`doctor` failures** or **contract issues** per existing kit severity — **`T867`** aligns with **`collectTaskPersistenceDoctorSummaryLines`** patterns.

## Decision — rollback

- **Disable flag** (`kit.cae.persistence = false`) stops **new** writes; adapter no-ops.
- **Schema rollback** is **not** supported in-place (same policy as other kit tables): operators rely on **backup/restore** of **`workspace-kit.db`** or **`init`** on a fresh DB. **Forward-only** migrations.

## Non-goals (v1)

- File-only primary store for CAE (e.g. JSONL under **`.workspace-kit/`**) as the **authoritative** relational source — **rejected** to avoid dual-writer races with SQLite task store.
- Storing **full** natural-language explanations as a **stable public API** without size caps (**`T846`** owns caps).

## Consequences

- **`T867`**: implement migrations + adapters per this ADR; **no parallel DB**.
- **`T846`**: size and redaction rules for persisted trace/explain fragments must **fit** retention and column types assumed here.
- **`T862`**: CLI surfaces read **session** state by default; optional read of persisted rows when enabled.

## References

- **`.ai/adrs/ADR-context-activation-engine-architecture-v1.md`**
- **`.ai/cae/acknowledgement-model.md`** (**`T844`**)
- **`.ai/cae/precedence-merge.md`** (**`T843`**)
- **`tasks/cae/specs/T846.md`**, **`tasks/cae/specs/T867.md`**
- **`src/core/state/workspace-kit-sqlite.ts`** — **`user_version`** migration ladder

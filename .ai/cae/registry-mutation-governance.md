# CAE SQLite registry mutation governance (Epic 5 / Phase 70)

**Canonical machine doc** for **Epic 5 E1** — CAE-specific mutation lane **distinct** from Tier A/B **`policyApproval`** on `workspace-kit run` (see **`.ai/POLICY-APPROVAL.md`** for the generic sensitive-command surface).

## Preconditions (enforced in handlers + router classification)

| Gate | Config / input | Denial code |
| --- | --- | --- |
| CAE on | **`kit.cae.enabled === true`** | **`cae-mutation-disabled`** |
| SQLite authority | **`kit.cae.registryStore === "sqlite"`** | **`cae-mutation-json-store`** |
| Admin break-glass | **`kit.cae.adminMutations === true`** | **`cae-mutation-admin-off`** |
| Explicit CAE approval | JSON **`caeMutationApproval`: `{ "confirmed": true, "rationale": "…" }`** | **`cae-mutation-approval-missing`** |
| Actor string | Non-empty **`actor`** on mutating commands | **`invalid-args`** |

**Read-only** registry admin introspection (**`cae-list-registry-versions`**, **`cae-get-registry-version`**) skips the mutation gate; they still require a readable kit SQLite DB and **`cae_registry_*`** DDL.

## Shipped manifest posture

- **Epic 5 E2:** Registry admin mutators are declared **`policySensitivity: "non-sensitive"`** in **`src/contracts/builtin-run-command-manifest.json`** so the **global** `policyApproval` prompt does **not** apply; governance is **entirely** the CAE gate above + handler validation.
- **Tier A unchanged:** **`cae-import-json-registry`** and **`cae-satisfy-ack`** remain **`sensitive`** with **`policyOperationId`** (import also writes **`cae_registry_mutations`** audit).

## Audit trail (Epic 5 E3)

Table **`cae_registry_mutations`** (kit SQLite **`user_version` ≥ 13`): **`recorded_at`**, **`actor`**, **`command_name`**, **`version_id`**, optional **`note`**, **`payload_json`**.

Implementers: call **`insertCaeRegistryMutationAudit`** after successful mutating paths (admin CLI + import).

## Review checklist (E2/E3 implementers)

1. New mutator registers in **`builtin-run-command-manifest.json`** with correct **`policySensitivity`** story.
2. Handler calls **`caeRegistryMutationGateError`** (or is explicitly read-only).
3. Successful mutation writes **`cae_registry_mutations`** when the table exists.
4. **`pnpm exec wk doctor`** passes; **`pnpm run check`** includes manifest + CAE tests.

## Cross-references

- **`.ai/cae/mutation-governance.md`** — product posture (maintainers, PR workflow, threat model).
- **`CAE_PLAN.md`** Epic 4–5 — scope source.
- **`.ai/cae/phase-70-registry-task-tracker.md`** — task IDs.

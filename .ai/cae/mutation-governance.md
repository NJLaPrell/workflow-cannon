# CAE activation & registry mutation governance (v1)

**Task:** **`T852`**. **Implementation options:** **`T868`** (mutating kit commands) **or** git-only workflow below. **Principles:** **`.ai/PRINCIPLES.md`** (**R009** — policy model changes need human approval).

## v1 default: git + PR (no agent self-service)

| Rule | Detail |
| --- | --- |
| **Source of truth** | Registry JSON and activation JSON under **`tasks/cae/`** / **`schemas/cae/`** / repo paths decided in **`T857`** — **versioned in git**, reviewed like product code. |
| **Who may change** | **Maintainers** via PR with normal review; **no** chat-only or agent-only writes to published registry paths. |
| **Agents** | May **propose** diffs in PR text; **must not** silently apply registry/activation mutations without maintainer merge. |
| **Validation** | **`pnpm run check`** + schema tests (`fixtures/cae/**`) must pass before merge; future **`cae-validate-*`** read-only commands (**`T868`**) wrap the same schemas. |

## Deferred mutating CLI (`T868`)

If **`T868`** ships **`cae-registry-apply`** / **`cae-activation-upsert`**-class commands:

- Classify **Tier A or B** in the manifest — **JSON `policyApproval` required** (same lane as other sensitive mutators).
- Append **audit** rows (SQLite or append-only JSONL) with actor, timestamp, **`clientMutationId`**, content hash (**`T845`** alignment).
- **This doc** remains authoritative for **who** may run them (maintainer role / break-glass only) unless a future ADR expands scope.

## Audit trail (when mutators exist)

| Field | Required |
| --- | --- |
| **`actor`** | Email / service id from session |
| **`mutationKind`** | `registry-upsert` \| `activation-upsert` \| `activation-retire` |
| **`targetId`** | `artifactId` or `activationId` |
| **`contentHash`** | Hash of canonical JSON body |
| **`recordedAt`** | ISO timestamp |

**Format:** append-only table **`cae_audit_mutations`** in planning SQLite (**`T867`**) **or** JSONL under **`.workspace-kit/cae/audit.log.jsonl`** — pick one in **`T868`**; do not dual-write without ADR.

## Threat model (short)

| Threat | Mitigation |
| --- | --- |
| **Agent tampering** | No autonomous apply; PR + CI; optional mutators behind **`policyApproval`**. |
| **Accidental broad scope** | Activation **`scope`** conditions reviewed in PR; schema bounds (**`T840`**). |
| **Shadow / live confusion** | Mutations never keyed off **`evaluationPipelineMode: shadow`** (**`T848`**). |
| **Bypass kit policy** | Mutators use same policy module as task-engine mutators (**`machine-cli-policy.md`**). |

## Acceptance alignment (**`T852`**)

**`T868`** either implements audited mutators **or** explicitly documents **“deferred; use git PR workflow only”** — this file satisfies the latter until **`T868`** states otherwise.

## T868 v1 closeout (validate-only)

- **Mutating `wk run` commands:** **`cae-satisfy-ack`** only (**`T878`**) — SQLite audit row for acknowledgement satisfaction; **re-validates** registry via **`loadCaeRegistry`** before commit; does **not** write registry JSON. No **`cae-registry-apply`** / agent self-service registry edits in v1.
- **Maintainer workflow (single page):** edit **`.ai/cae/registry/*.json`** + **`schemas/cae/**`** in a normal PR; **`pnpm run check`** (schema + CAE fixtures) must pass; reviewers treat registry diffs like product code (**`T852`** table above).
- **Validate command:** **`cae-registry-validate`** (Tier C — no **`policyApproval`**) loads the registry the same way as **`cae-health`** and returns **`registryContentHash`** plus row counts — use in CI or pre-merge when touching CAE seed data. See **`.ai/cae/cli-read-only.md`**.

## Cross-references

- **`.ai/cae/enforcement-lane.md`** — enforcement does not mutate registry.
- **`ADR-cae-persistence-v1.md`** (**`T845`**) — audit storage posture.
- **`tasks/cae/specs/T868.md`**

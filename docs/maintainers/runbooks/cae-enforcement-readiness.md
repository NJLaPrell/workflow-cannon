<!-- GENERATED FROM .ai/runbooks/cae-enforcement-readiness.md — edit that file; do not hand-edit this render (see docs/maintainers/adrs/ADR-ai-canonical-maintainer-docs-pipeline.md) -->

# CAE enforcement readiness (authored rules)

**Machine canon.** Defines when an **authored** Guidance draft may advance toward **kit enforcement** (pilot allowlist today). This is **not** `policyApproval` on `workspace-kit run`, **not** `caeMutationApproval` on registry mutators, and **not** acknowledgement satisfaction alone.

## Lanes (do not mix)

| Lane | Where | Purpose |
| --- | --- | --- |
| **Acknowledgement** | `cae-satisfy-ack` / preview pending acks | “I read this guidance.” |
| **CAE mutation approval** | `caeMutationApproval` JSON on CAE registry admin commands | Approve **versioned registry writes**. |
| **Tier A/B `policyApproval`** | Sensitive `wk run` mutators | Approve **task engine / policy-sensitive kit** operations. |
| **Enforcement** | `kit.cae.enforcement.enabled` + `src/core/cae/cae-enforcement-allowlist.ts` | **Block** selected commands when the evaluated bundle matches the allowlist. |

## Family policy

- **`policy`** — only family that may ever be considered for **hard-stop enforcement** (subject to allowlist + config).
- **`think`**, **`do`**, **`review`** — **advisory / read / review surfaces only**; never promoted to CAE enforcement blocks through this contract.

## Readiness fields (product / CLI)

Computed on `cae-guidance-preview` when **`draftRule`** is present, as **`data.enforcementReadiness`** (`schemaVersion: 1`):

| Field | Meaning |
| --- | --- |
| `previewedAt` | ISO time readiness was computed. |
| `previewDigest` | Short fingerprint from overlay digest / scope. |
| `affectedScopeSummary` | Plain-language scope from draft impact. |
| `conflictStatus` | `none` \| `warning` \| `blocking` (from activation readiness + conflicts). |
| `activationReadinessLevel` | `ok` \| `warning` \| `stop_confirm` from draft impact. |
| `registryMutationAuditId` | From optional **`enforcementGovernanceEvidence`** (after mutation). |
| `rollbackTargetVersionId` | Prior active version to roll back to, if recorded. |
| `governanceActor` / `governanceRationale` | Operator evidence; not `policyApproval`. |
| `familyHardStopCapable` | `true` only for `policy` drafts. |
| `previewGatesSatisfied` | Family + scope errors + no `stop_confirm` / block-severity readiness reasons. |
| `governanceEvidenceComplete` | `previewGatesSatisfied` **and** audit id, rollback id, actor, rationale all non-empty. |
| `blockingCodes` | Stable codes for automation (e.g. `cae-enforce-family-advisory-only`). |
| `notes` | Operator-facing sentences. |

Optional **`enforcementGovernanceEvidence`** on **`cae-guidance-preview`** (requires **`draftRule`**), `schemaVersion: 1`:

- `registryMutationAuditId` (string)
- `rollbackTargetVersionId` (string)
- `actor` (string)
- `rationale` (string)

## Draft rule guardrails

**`draftRule` must not** carry enforcement keys (`enforcement`, `hardStop`, `blockingEnforcement`, …) — use preview + registry workflow instead (`assertDraftRuleHasNoEnforcementFlags` / `cae-enforce-draft-flag-forbidden`).

## Promotion bar (summary)

1. Run **draft impact preview**; require **`previewGatesSatisfied`** for any promotion discussion.
2. Complete **CAE registry mutation** with **`caeMutationApproval`**; record **audit** row and **rollback** target version.
3. Turn on **`kit.cae.enforcement.enabled`** only with maintainer intent; **allowlist** remains the only hard-stop surface until expanded deliberately.

## Code

- `src/core/cae/guidance-enforcement-readiness.ts` — `computeGuidanceEnforcementReadiness`, family constants.
- `src/core/cae/cae-enforcement-allowlist.ts` — pilot command blocks.

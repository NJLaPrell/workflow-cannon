# Dashboard policy UX (machine)

**Scope:** Cursor extension Dashboard channel vs terminal `pnpm exec wk run` / agent JSON `policyApproval`.

## Rationale channels

| Channel | Who writes `policyApproval.rationale` | Contract |
| --- | --- | --- |
| **Dashboard (routine tier)** | `buildDashboardPolicyApproval` in `extensions/cursor-workflow-cannon/src/policy/` | Structured pipe segments: `dashboard\|workflow=…\|command=…\|action=…\|tier=routine\|taskId=…\|phaseKey=…` |
| **Dashboard (elevated tier)** | Operator drawer text + structured prefix from the same helper | Prefix as routine; append `\|detail=<human text>` |
| **CLI / agents** | Human or agent in JSON argv | Free-form but must be non-empty; **do not** copy Dashboard boilerplate as a substitute for operator intent |

Tier matrix: `extensions/cursor-workflow-cannon/src/policy/dashboard-policy-tier.ts`.

## Agents

- Routine Dashboard paths auto-fill rationale via `buildDashboardPolicyApproval`; **your** Tier A/B `wk run` still needs explicit JSON `policyApproval` per `.ai/POLICY-APPROVAL.md`.
- Chat or dashboard button clicks are **not** approval for `workspace-kit run`.

## Manual QA checklist (Phase 107)

1. **Routine path** — Dashboard: accept one proposed task (single-row drawer has no policy rationale field). Submit succeeds; inspect `.workspace-kit/policy/traces.jsonl` for a line containing `tier=routine` and `workflow=accept-proposed`.
2. **Elevated path** — Dashboard: Accept All on a phase bucket with 2+ proposed rows, or open rewind-checkpoint. Drawer shows elevated explainer; submit requires non-empty rationale (rewind ≥12 chars). Trace contains `tier=elevated` and `|detail=`.
3. **CLI unchanged** — `pnpm exec wk run run-transition` without `policyApproval` on a sensitive action still returns `policy-denied`.

## Sample trace rationales (illustrative)

- Routine auto: `dashboard|workflow=review-approval-item|command=review-item|action=accept|tier=routine|taskId=T100123`
- Elevated human: `dashboard|workflow=rewind-to-checkpoint|command=rewind-to-checkpoint|action=rewind|tier=elevated|detail=Revert mistaken stash apply before handoff`

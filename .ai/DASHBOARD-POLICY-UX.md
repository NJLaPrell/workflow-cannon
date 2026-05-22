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

- Routine Dashboard paths auto-fill rationale in later Phase 107 tasks; **your** Tier A/B `wk run` still needs explicit JSON `policyApproval` per `.ai/POLICY-APPROVAL.md`.
- Chat or dashboard button clicks are **not** approval for `workspace-kit run`.

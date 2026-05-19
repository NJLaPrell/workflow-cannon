<!--
agentCapsule|v=1|command=harvest-delivery-evidence|module=task-engine|schema_only=pnpm exec wk run harvest-delivery-evidence --schema-only '{}'
-->

# harvest-delivery-evidence

Inspect the current git branch (and optional linked GitHub PR metadata) to build a deterministic `metadata.deliveryEvidence` preview. Optional **apply** persists via the task store (no hand-edited SQLite).

## Usage

```bash
# Preview (read-only — omit apply)
pnpm exec wk run harvest-delivery-evidence '{"taskId":"T100211"}'

# Apply (Tier B — JSON policyApproval on argv)
pnpm exec wk run harvest-delivery-evidence '{"taskId":"T100211","apply":true,"expectedPlanningGeneration":<n>,"policyApproval":{"confirmed":true,"rationale":"populate delivery evidence after merge"}}'
```

## Args

| Field | Required | Notes |
| --- | --- | --- |
| `taskId` | preview: optional; apply: **yes** | Target task for apply and recommend-validation fan-in. |
| `apply` | no | Default **false** (preview). When **true**, writes `metadata.deliveryEvidence`. |
| `branchName` | no | Override detected branch (default: `git rev-parse --abbrev-ref HEAD`). |
| `baseBranch` | no | Override PR base (default: resolved phase integration branch or upstream). |
| `mergeSha` | no | Override HEAD / merge commit SHA. |
| `validationCommands` | no | Explicit `[{command, result\|exitCode}]`; else seeds from `recommend-validation` when `taskId` is set. |
| `expectedPlanningGeneration` | when policy `require` | Copy from `list-tasks` / `get-next-actions`. |
| `policyApproval` | apply: **yes** | Tier B JSON approval — not chat-only. |

## Response

- `data.deliveryEvidence` — v1 GitHub PR-shaped object when policy profile is `github-pr`.
- `data.missingFields` — dotted paths still required for `run-transition` **complete** under enforce mode.
- `data.signalStatus` — `git` / `github` availability.
- `data.remediationCommands` — copy-paste next steps when signals are missing.

## Related

- `recommend-validation` — suggested `validationCommands` when not supplied.
- `phase-delivery-preflight` — verify evidence across a phase before closeout.
- `completion-preflight` — per-task guard preview before **complete**.

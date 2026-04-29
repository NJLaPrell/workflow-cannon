<!--
agentCapsule|v=1|command=list-approval-queue|module=approvals|schema_only=pnpm exec wk run list-approval-queue --schema-only '{}'
-->

# list-approval-queue

Read-only: list **improvement** tasks in **`ready`** or **`in_progress`** — the queue **`review-item`** operates on — plus stable pointers to policy and decision artifacts under **`.workspace-kit/`**.

Does not mutate task store, approvals JSONL, or policy files.

## Usage

```
workspace-kit run list-approval-queue '{}'
```

## Arguments

Optional JSON object; accepts standard invocation `config` overlay only.

## Returns

`data` includes:

| Field | Description |
| --- | --- |
| `schemaVersion` | `1` |
| `reviewItemQueue` | Array of `{ id, title, status, phase, phaseKey, priority }` rows (priority sort, P2 before P9) |
| `count` | Length of `reviewItemQueue` |
| `operatorHints` | Copy-paste examples (`reviewItemExample`, `triageProposedImprovements`), playbook path, `policyArtifacts[]`, `dashboardSummary` line |
| `planningGeneration` | Current planning generation (same as `list-tasks`) |
| `planningGenerationPolicy` | `require` / `warn` / `off` from effective config |

## Related

- **`review-item`** — record accept / decline / accept_edited for a single improvement id
- **`.ai/POLICY-APPROVAL.md`** — JSON **`policyApproval`** on sensitive `workspace-kit run` commands
- **`dashboard-summary`** — rollups including proposed / ready improvement slices

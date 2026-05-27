<!--
agentCapsule|v=1|command=sync-task-store-after-merge|module=task-engine|schema_only=pnpm exec wk run sync-task-store-after-merge --schema-only '{}'
-->

# sync-task-store-after-merge

**Legacy / recovery:** Prefer **`task-state-hydrate`** when `tasks.canonicalAuthority` is **`git-event-log`**. This command remains for feature-branch SQLite recovery only.

Diff task-engine SQLite state between a **source** git ref (feature branch) and the **working-tree** target, then replay missing transitions idempotently (`clientMutationId` when present).

## Usage

Dry-run (default):

```
pnpm exec wk run sync-task-store-after-merge '{"sourceRef":"feature/T100340-arch-mismatch-remediation","targetRef":"working-tree"}'
```

Apply:

```
pnpm exec wk run sync-task-store-after-merge '{"sourceRef":"feature/T100340-arch-mismatch-remediation","apply":true,"policyApproval":{"confirmed":true,"rationale":"sync task evidence after merge"}}'
```

## Arguments

| Field | Required | Description |
| --- | --- | --- |
| `sourceRef` | yes | Git ref for the branch that held task work (branch name, `origin/...`, or SHA). |
| `targetRef` | no | Defaults to `working-tree` (current checkout DB). |
| `dryRun` | no | Default **true** unless `apply` is **true**. |
| `apply` | no | When **true**, replays missing transitions on the target store. |
| `policyApproval` | yes when `apply` | Tier B approval for mutating apply. |

## Related

- `workspace-kit doctor` — warns when the working-tree task DB blob SHA diverges from `origin/release/phase-<N>`.

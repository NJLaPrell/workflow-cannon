<!--
agentCapsule|v=1|command=phase-closeout-readiness|module=task-engine|schema_only=pnpm exec wk run phase-closeout-readiness --schema-only '{}'
-->

# phase-closeout-readiness

Read-only audit for unfinished phase-scoped tasks before phase closeout.

## Usage

```
workspace-kit run phase-closeout-readiness '{"phaseKey":"94"}'
```

## Arguments

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `phaseKey` | string | no | Stable phase key to audit. Defaults to the canonical current phase from `kit_workspace_status`, then config fallback. |

## Returns

Success `data` includes `passed`, `remainingCount`, `remainingByStatus`, `terminalCount`, and `checkedTaskCount`.

Closeout may proceed only when `passed` is `true`, or when every remaining task has an explicit maintainer decision outside this command. `remainingByStatus` groups unfinished tasks such as `proposed`, `ready`, `in_progress`, and `blocked` so agents can finish, move, block, cancel, or defer them deliberately before release evidence is built.

## Related

- `workspace-kit run phase-delivery-preflight` — evidence, readiness, and stranded-work preflight for release prep.
- `.ai/playbooks/phase-closeout-and-release.md` — ordered phase closeout procedure.
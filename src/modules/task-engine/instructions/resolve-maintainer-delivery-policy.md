<!--
agentCapsule|v=1|command=resolve-maintainer-delivery-policy|module=task-engine|schema_only=pnpm exec wk run resolve-maintainer-delivery-policy --schema-only '{}'
-->

# resolve-maintainer-delivery-policy

Read-only resolver: turns effective **`maintainerDelivery`** workspace config (plus optional module overrides and task metadata hints) into concrete branch patterns, review/evidence modes, and playbook pointers.

Does **not** mutate tasks or config.

## Usage

```
pnpm exec wk run resolve-maintainer-delivery-policy '{"taskId":"T100109"}'
pnpm exec wk run resolve-maintainer-delivery-policy '{"taskId":"T999","phaseKey":"83","slug":"my-task"}'
pnpm exec wk run resolve-maintainer-delivery-policy '{"phaseKey":"83","moduleId":"task-engine"}'
```

## Arguments

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `taskId` | string | no | Existing task id (loads row for metadata + title slug). If the row is missing, pass **`phaseKey`** (and optional **`slug`**) for prospective resolution. |
| `phaseKey` | string | no | Stable phase key for expanding `{phaseKey}` in branch patterns. |
| `moduleId` | string | no | Selects **`maintainerDelivery.moduleOverrides.<moduleId>`** when present. |
| `slug` | string | no | Overrides slug used in **`taskBranchPattern`** tokens (default from task title when a row exists). |
| `version` | string | no | Token for **`releaseTagPattern`** expansion. |

## Response

- **`data.resolvedPolicy`** — **`schemaVersion`**: `1` machine object (phase/task branch patterns, merge target, evidence/review modes).
- **`data.explain`** — provenance entries (`task-metadata`, `module-override`, `workspace-default`, `built-in-default`).
- **`data.warnings`** — non-fatal conflicts (unknown metadata profile keys, `requiresPhaseBranch` mismatches, etc.).
- **`data.precedenceOrder`** — documented evaluation order for overrides.

## Related

- Delivery playbook — `.ai/playbooks/task-to-phase-branch.md`
- Preflight audit — `workspace-kit run phase-delivery-preflight`

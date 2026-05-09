<!--
agentCapsule|v=1|command=cae-list-workspace-artifact-templates|module=context-activation|schema_only=pnpm exec wk run cae-list-workspace-artifact-templates --schema-only '{}'
-->

# cae-list-workspace-artifact-templates

Read-only list of built-in starter markdown templates for workspace CAE artifacts (playbook, runbook, checklist, etc.).

## Usage

```
workspace-kit run cae-list-workspace-artifact-templates '{"schemaVersion":1}'
```

## Arguments

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `schemaVersion` | number | yes | Must be **1**. |

## Returns

`ok: true`, **`code`**: `cae-list-workspace-artifact-templates-ok`, and `data.templates`: array of `{ id, artifactType, title, contentMarkdown }`.

This command does not require `caeMutationApproval` and does not open the planning SQLite database.

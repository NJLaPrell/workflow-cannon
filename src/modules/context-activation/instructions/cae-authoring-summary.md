<!--
agentCapsule|v=1|command=cae-authoring-summary|module=context-activation|schema_only=pnpm exec wk run cae-authoring-summary --schema-only '{}'
-->

# cae-authoring-summary

Read-only aggregate payload for the dashboard Guidance authoring surface.

```bash
workspace-kit run cae-authoring-summary '{"schemaVersion":1}'
```

## Args

| Field | Required | Notes |
| --- | --- | --- |
| `schemaVersion` | yes | Must be `1`. |

## Returns

`ok: true`, `code: "cae-authoring-summary-ok"`, and `data.schemaVersion: 1`.

The `data` object includes:

- `activeVersion` — active registry version metadata plus the current registry digest.
- `artifacts` — authoring-classified artifact rows with source, lifecycle, status, and file ownership labels.
- `activations` — authoring-classified activation rows with source, lifecycle, status, and referenced artifact summaries.
- `counts` — source/status/type/family rollups plus recent mutation count.
- `validation` and `validationWarnings` — registry validation result and current CAE issues.
- `recentMutations` — latest CAE registry mutation audit rows when SQLite is available.
- `readiness` — aggregate authoring readiness and coarse mutation capability.
- `workspaceArtifactMarkdownTemplates` — built-in starter templates (`id`, `artifactType`, `title`, `contentMarkdown`) for the Guidance artifact editor.

This command is Tier C / read-only and does not accept `policyApproval`.
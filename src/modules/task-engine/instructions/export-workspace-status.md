<!--
agentCapsule|v=1|command=export-workspace-status|module=task-engine|schema_only=pnpm exec wk run export-workspace-status --schema-only '{}'
-->

# export-workspace-status

Emit a **non-authoritative** YAML export of **`kit_workspace_status`** to **`docs/maintainers/data/workspace-kit-status.db-export.yaml`** (does not replace maintainer **`workspace-kit-status.yaml`**).

The file begins with a structured **`kit_export_envelope`** block (`authoritative: false`, `generated_at`, `source_sequence`, `source_kind`). A legacy **`# workspace_revision:`** comment is also written for compatibility. **`phase-status`** reads **`source_sequence`** (or the legacy comment) to decide export freshness — unrelated task/CAE writes to the planning SQLite file do not make this export stale.

## Usage

Dry run (stdout payload only):

```
workspace-kit run export-workspace-status '{"dryRun":true}'
```

Write file:

```
workspace-kit run export-workspace-status '{}'
```

## Arguments

| Field | Description |
| --- | --- |
| **`dryRun`** | When **`true`**, return **`yamlBody`** without writing. |

## Response

- **`fileRelativePath`**: export path.
- **`yamlBody`**: present on dry-run success.

See **ADR-workspace-status-sqlite-authority-v1** and **`.ai/runbooks/workspace-status-sqlite.md`**.

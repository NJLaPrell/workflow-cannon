# export-workspace-status

Emit a **non-authoritative** YAML export of **`kit_workspace_status`** to **`docs/maintainers/data/workspace-kit-status.db-export.yaml`** (does not replace maintainer **`workspace-kit-status.yaml`**).

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

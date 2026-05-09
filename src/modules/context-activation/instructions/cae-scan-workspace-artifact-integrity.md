<!--
agentCapsule|v=1|command=cae-scan-workspace-artifact-integrity|module=context-activation|schema_only=pnpm exec wk run cae-scan-workspace-artifact-integrity --schema-only '{}'
-->

# cae-scan-workspace-artifact-integrity

Read-only scan of workspace-owned CAE markdown under **`.ai/cae/artifacts/<type>/`** compared to SQLite registry paths for a registry version:

- **`orphan_file`** — markdown on disk not referenced by any `workspace.*` artifact row path.
- **`broken_ref`** — non-retired `workspace.*` row whose `path` does not exist on disk.

Each finding includes a short **`suggestion`** string.

Tier **C** — no **`policyApproval`**.

## Usage

```
workspace-kit run cae-scan-workspace-artifact-integrity '{"schemaVersion":1}'
```

Optional explicit version:

```
workspace-kit run cae-scan-workspace-artifact-integrity '{"schemaVersion":1,"versionId":"cae.reg.seed"}'
```

## Arguments

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `schemaVersion` | number | yes | Must be **1**. |
| `versionId` | string | no | Registry version to scan; defaults to active. |

## Returns

`ok: true`, **`code`**: `cae-scan-workspace-artifact-integrity-ok`, **`data`** with **`schemaVersion`**: **1**, **`versionId`**, and **`findings`**.

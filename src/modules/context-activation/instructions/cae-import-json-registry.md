# cae-import-json-registry

Import the **validated** CAE JSON registry (default `.ai/cae/registry/*.json`) into **kit planning SQLite** as a **new active** `cae_registry_versions` row plus `cae_registry_artifacts` / `cae_registry_activations` rows.

Tier **A** — include JSON **`policyApproval`** on `workspace-kit run` (see `.ai/machine-cli-policy.md`).

## Usage

```
workspace-kit run cae-import-json-registry '{"schemaVersion":1,"policyApproval":{"confirmed":true,"rationale":"seed sqlite registry"}}'
```

Optional paths (repo-relative from workspace root):

```
workspace-kit run cae-import-json-registry '{"schemaVersion":1,"artifactsRelativePath":".ai/cae/registry/artifacts.v1.json","activationsRelativePath":".ai/cae/registry/activations.v1.json","actor":"maintainer","note":"phase 70 import","policyApproval":{"confirmed":true,"rationale":"import"}}'
```

## Arguments

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `schemaVersion` | number | yes | Must be **1**. |
| `policyApproval` | object | yes | Tier A approval per policy registry. |
| `artifactsRelativePath` | string | no | Defaults to `.ai/cae/registry/artifacts.v1.json`. |
| `activationsRelativePath` | string | no | Defaults to `.ai/cae/registry/activations.v1.json`. |
| `versionId` | string | no | Stable id for the new version; default `cae.reg.import.<timestamp>`. |
| `actor` | string | no | Recorded in `created_by` (default `import`). |
| `note` | string | no | Stored on the version row. |

## Returns

`ok: true`, **`code`**: `cae-import-json-registry-ok`, **`data.versionId`**, counts.

## After import

Set **`kit.cae.registryStore`** to **`sqlite`** (project or user config) so CAE commands load from SQLite instead of JSON.

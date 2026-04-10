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

## Path verification (**T892** / CAE_PLAN C2)

Before writing SQLite rows, the handler loads JSON with **`verifyArtifactPaths: true`**. Every artifact **`ref.path`** must:

- be **repo-relative** (not an absolute path),
- resolve **inside the workspace root** (no `..` escape),
- refer to a **file that exists** on disk.

Failures use **`cae-artifact-path-invalid`** or **`cae-artifact-missing`** (see **`.ai/cae/error-codes.md`**).

## Returns

`ok: true`, **`code`**: `cae-import-json-registry-ok`, **`data.versionId`**, counts.

## After import

**`kit.cae.registryStore`** defaults to **`sqlite`** (kit defaults). Use **`json`** only for explicit JSON bootstrap or tests.

**CI / `pnpm run check`:** when the kit DB has **no active** CAE registry version, **`scripts/check-cae-registry.mjs`** seeds from the same default JSON paths before running **`cae-registry-validate`** (idempotent).

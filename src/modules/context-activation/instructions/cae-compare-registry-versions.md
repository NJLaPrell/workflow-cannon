<!--
agentCapsule|v=1|command=cae-compare-registry-versions|module=context-activation|schema_only=pnpm exec wk run cae-compare-registry-versions --schema-only '{}'
-->

# cae-compare-registry-versions

Read-only diff of two CAE registry **SQLite** versions: artifacts and activations are classified into **added**, **removed**, **changed**, **retired**, **hidden** (activations only), and **conflicting** (duplicate paths per version, or same `artifact_id` with different `path`). Optional file SHA256 when **`includeFileContentHashes`** is true.

Tier **C** — no **`policyApproval`**.

## Usage

```
workspace-kit run cae-compare-registry-versions '{"schemaVersion":1,"fromVersionId":"cae.reg.seed","toVersionId":"cae.reg.clone"}'
```

Optional file hashes (paths resolved from workspace root):

```
workspace-kit run cae-compare-registry-versions '{"schemaVersion":1,"fromVersionId":"cae.reg.seed","toVersionId":"cae.reg.clone","includeFileContentHashes":true}'
```

## Arguments

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `schemaVersion` | number | yes | Must be **1**. |
| `fromVersionId` | string | yes | Left-hand registry version id. |
| `toVersionId` | string | yes | Right-hand registry version id (must differ from **`fromVersionId`**). |
| `includeFileContentHashes` | boolean | no | When **true**, include **`fileContentHashDiffs`** for artifacts where at least one side has a **`path`** and the on-disk SHA256 differs or one side is missing. |

## Returns

`ok: true`, **`code`**: `cae-compare-registry-versions-ok`, **`data`** with **`schemaVersion`**: **1**, version ids, **`artifacts`** / **`activations`** buckets, optional **`fileContentHashDiffs`**.

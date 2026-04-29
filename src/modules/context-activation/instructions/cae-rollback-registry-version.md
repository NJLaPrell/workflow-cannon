<!--
agentCapsule|v=1|command=cae-rollback-registry-version|module=context-activation|schema_only=pnpm exec wk run cae-rollback-registry-version --schema-only '{}'
-->

# cae-rollback-registry-version

Activate the chronologically **previous** registry version relative to the current active version.

## Usage

```
workspace-kit run cae-rollback-registry-version '{"schemaVersion":1,"actor":"operator","caeMutationApproval":{"confirmed":true,"rationale":"rollback"}}'
```

## Arguments

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `schemaVersion` | number | yes | Must be **1**. |
| `actor` | string | yes | Audit actor. |
| `caeMutationApproval` | object | yes | CAE governance lane. |
| `note` | string | no | Audit note. |

## Returns

`ok: true`, **`code`**: `cae-rollback-registry-version-ok`, **`data.activatedVersionId`**.

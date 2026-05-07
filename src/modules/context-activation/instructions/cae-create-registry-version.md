<!--
agentCapsule|v=1|command=cae-create-registry-version|module=context-activation|schema_only=pnpm exec wk run cae-create-registry-version --schema-only '{}'
-->

# cae-create-registry-version

Create an empty CAE registry version (optional **`setActive`**). Requires **`.ai/cae/registry-mutation-governance.md`** gate: **`kit.cae.enabled`**, **`kit.cae.adminMutations`**, **`caeMutationApproval`**, **`actor`**.

## Usage

```
workspace-kit run cae-create-registry-version '{"schemaVersion":1,"actor":"operator","versionId":"cae.reg.v2","note":"empty draft","setActive":false,"caeMutationApproval":{"confirmed":true,"rationale":"create version"}}'
```

## Arguments

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `schemaVersion` | number | yes | Must be **1**. |
| `actor` | string | yes | Recorded on the version row + audit trail. |
| `caeMutationApproval` | object | yes | **`{ "confirmed": true, "rationale": "…" }`** — CAE lane (not **`policyApproval`**). |
| `versionId` | string | no | Defaults to time-based id when omitted. |
| `note` | string | no | Version note. |
| `setActive` | boolean | no | When **true**, clears other active flags and activates this version. |
| `expectedActiveVersionId` | string | no | Optional optimistic-concurrency token from the last authoring read. Mutations fail with **`cae-stale-state`** when the active version changed. |
| `expectedRegistryDigest` | string | no | Optional registry digest from the last authoring read. Mutations fail with **`cae-stale-state`** when the active registry content changed. |

## Returns

`ok: true`, **`code`**: `cae-create-registry-version-ok`.

When the expected version or digest no longer matches the active registry, the command returns **`ok: false`**, **`code: "cae-stale-state"`**, and a repair payload instructing the caller to refresh authoring state and retry.

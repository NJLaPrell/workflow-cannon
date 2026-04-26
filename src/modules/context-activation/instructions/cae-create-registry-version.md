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

## Returns

`ok: true`, **`code`**: `cae-create-registry-version-ok`.

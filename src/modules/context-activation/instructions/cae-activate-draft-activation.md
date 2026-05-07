<!--
agentCapsule|v=1|command=cae-activate-draft-activation|module=context-activation|schema_only=pnpm exec wk run cae-activate-draft-activation --schema-only '{}'
-->

# cae-activate-draft-activation

Promote a stored `draft` activation to `active` after validation and, when the draft is broad or policy-family, fresh Guidance preview evidence.

## Usage

```
workspace-kit run cae-activate-draft-activation '{"schemaVersion":1,"actor":"operator","activationId":"cae.activation.draft.example","previewEvidence":{"schemaVersion":1,"registryContentHash":"<from-cae-guidance-preview>","traceId":"<from-cae-guidance-preview>"},"caeMutationApproval":{"confirmed":true,"rationale":"publish draft activation"}}'
```

## Arguments

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `schemaVersion` | number | yes | Must be **1**. |
| `actor` | string | yes | Audit actor. |
| `caeMutationApproval` | object | yes | CAE governance lane. |
| `activationId` | string | yes | Target activation id. The stored row must be in **`draft`** lifecycle state. |
| `previewEvidence` | object | conditional | Fresh **`cae-guidance-preview`** response data, or a trimmed **`schemaVersion: 1`** object containing **`registryContentHash`** and optional **`traceId`** / readiness fields. Required when the draft is policy-family or uses broad scopes such as `always` or command-name prefixes. |
| `versionId` | string | no | Defaults to active version. |
| `note` | string | no | Audit note. |
| `expectedActiveVersionId` | string | no | Optional optimistic-concurrency token from the last authoring read. Mutations fail with **`cae-stale-state`** when the active version changed. |
| `expectedRegistryDigest` | string | no | Optional registry digest from the last authoring read. Mutations fail with **`cae-stale-state`** when the active registry content changed. |

## Returns

`ok: true`, **`code`**: `cae-activate-draft-activation-ok`.

Successful responses include `lifecycleState: "active"`, `artifactRefs`, broad-scope `warnings`, `previewEvidenceRequired`, and a `publish` metadata block. The stored activation metadata receives the same publish checkpoint, and the mutation audit payload records the activation id, new lifecycle state, and preview evidence summary.

Broad or policy-family drafts without preview evidence return **`ok: false`**, **`code: "cae-preview-evidence-required"`**. Preview evidence with a stale `registryContentHash` returns **`ok: false`**, **`code: "cae-stale-state"`** so callers refresh authoring state before retrying.

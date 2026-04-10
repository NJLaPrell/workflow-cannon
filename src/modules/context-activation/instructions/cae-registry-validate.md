# cae-registry-validate

Tier **C** — no JSON `policyApproval`.

## Usage

```bash
pnpm exec wk run cae-registry-validate '{"schemaVersion":1}'
```

## Arguments

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `schemaVersion` | number | yes | Must be `1`. |

## Success

`code`: `cae-registry-validate-ok` — `data` includes `registryContentHash`, `artifactCount`, `activationCount`.

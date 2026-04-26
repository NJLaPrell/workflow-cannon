# cae-registry-validate

Tier **C** — no JSON `policyApproval`.

## Usage

```bash
pnpm exec wk run cae-registry-validate '{"schemaVersion":1}'
pnpm exec wk run cae-validate-registry '{"schemaVersion":1}'
```

**`cae-validate-registry`** is an alias of this command (same **`code`** and payload); see **`cae-validate-registry.md`**.

## Arguments

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `schemaVersion` | number | yes | Must be `1`. |

## Success

`code`: `cae-registry-validate-ok` — `data` includes `registryContentHash`, `artifactCount`, `activationCount`.

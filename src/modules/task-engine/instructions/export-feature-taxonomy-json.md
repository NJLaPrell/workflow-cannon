# export-feature-taxonomy-json

Write `src/modules/documentation/data/feature-taxonomy.json` from the SQLite feature registry (validated against taxonomy schema). Path must stay under the documentation `data/` directory.

## Usage

```
workspace-kit run export-feature-taxonomy-json '{"dryRun":true}'
workspace-kit run export-feature-taxonomy-json '{"policyApproval":{"confirmed":true,"rationale":"sync taxonomy json"}}'
```

## Arguments

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `dryRun` | boolean | no | Preview only |
| `outputRelativePath` | string | no | Default: `src/modules/documentation/data/feature-taxonomy.json` |
| `policyApproval` | object | yes (live) | Sensitive write |

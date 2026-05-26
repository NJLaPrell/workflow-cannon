<!--
agentCapsule|v=1|command=export-feature-taxonomy-json|module=task-engine|schema_only=pnpm exec wk run export-feature-taxonomy-json --schema-only '{}'
-->

# export-feature-taxonomy-json

Write `src/modules/documentation/data/feature-taxonomy.json` from the SQLite feature registry. Output is wrapped as `{ kitExportEnvelope, payload }` where **`kitExportEnvelope`** declares **`authoritative: false`**, **`generatedAt`**, and **`sourceSequence`** (planning generation). Inner **`payload`** is validated against the taxonomy schema. Path must stay under the documentation `data/` directory.

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

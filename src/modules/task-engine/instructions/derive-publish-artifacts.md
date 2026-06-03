<!--
agentCapsule|v=1|command=derive-publish-artifacts|module=task-engine|schema_only=pnpm exec wk run derive-publish-artifacts --schema-only '{}'
-->

# derive-publish-artifacts

Emit a **`publishArtifacts[]` fragment** plus bounded **`readinessChecks[]`** for release version, changelog, schema mirror, and already-published state.

## Usage

```bash
pnpm exec wk run derive-publish-artifacts '{"version":"0.97.0"}'
```

`version` and `packageName` default from `package.json` when omitted. Optional `distTag` (default `latest`).

## Returns

`data.fragment` with `publishArtifacts[]`, `readinessChecks[]`, and `degraded[]` when GitHub/npm signals are unavailable.

Each readiness check is reference-first: it points to the exact command or artifact path needed to remediate missing changelog/schema/version problems without embedding full changelog or schema content.

## Related

- `release-evidence-manifest`
- `derive-validations`

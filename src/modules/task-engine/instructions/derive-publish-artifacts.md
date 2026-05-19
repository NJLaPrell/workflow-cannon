<!--
agentCapsule|v=1|command=derive-publish-artifacts|module=task-engine|schema_only=pnpm exec wk run derive-publish-artifacts --schema-only '{}'
-->

# derive-publish-artifacts

Emit a **`publishArtifacts[]` fragment** from git tag, `gh release view`, and `npm view` for a release version.

## Usage

```bash
pnpm exec wk run derive-publish-artifacts '{"version":"0.97.0"}'
```

`version` and `packageName` default from `package.json` when omitted. Optional `distTag` (default `latest`).

## Returns

`data.fragment` with `publishArtifacts[]` and `degraded[]` when GitHub/npm signals are unavailable.

## Related

- `release-evidence-manifest`
- `derive-validations`

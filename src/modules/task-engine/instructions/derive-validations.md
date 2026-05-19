<!--
agentCapsule|v=1|command=derive-validations|module=task-engine|schema_only=pnpm exec wk run derive-validations --schema-only '{}'
-->

# derive-validations

Emit a **`validations[]` fragment** for `release-evidence-manifest` from closeout gate commands or a saved gates JSON file.

## Usage

```bash
pnpm exec wk run derive-validations '{"phaseKey":"103"}'
```

Optional: `releaseVersion`, `gatesOutputPath`, `conclusion` (defaults to `success`).

## Returns

`data.fragment` includes `schemaVersion`, `fragmentKind: "validations"`, `validations[]`, and `source`.

Write the fragment to `.workspace-kit/release-evidence/<version>/validations.json` and build the manifest with `merge: true`.

## Related

- `release-evidence-manifest` — final assembly
- `derive-publish-artifacts` — publish proof fragment

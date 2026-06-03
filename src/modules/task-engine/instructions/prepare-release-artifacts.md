<!--
agentCapsule|v=1|command=prepare-release-artifacts|module=task-engine|schema_only=pnpm exec wk run prepare-release-artifacts --schema-only '{}'
-->

# prepare-release-artifacts

Preview or apply the deterministic release artifact update script for `package.json`, changelog pointers, and version mirror files.

This command delegates the file mutation plan to `scripts/prepare-release-artifacts.mjs` so the CLI orchestration does not duplicate edit logic.

## Usage

Dry-run preview (default):

```bash
pnpm exec wk run prepare-release-artifacts '{"version":"0.99.27","date":"2026-06-04"}'
```

Apply the edits and write a release-evidence fragment for the changed artifact refs:

```bash
pnpm exec wk run prepare-release-artifacts '{"version":"0.99.27","date":"2026-06-04","dryRun":false,"policyApproval":{"confirmed":true,"rationale":"prepare release artifacts for phase closeout"}}'
```

## Arguments

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `version` | string | no | Release version. Defaults to `package.json` `version`. |
| `date` | string | no | Release heading date (`YYYY-MM-DD`). Defaults to today in UTC. |
| `dryRun` | boolean | no | Defaults to `true`. Set `false` to apply edits and write the fragment file. |
| `policyApproval` | object | apply only | Required when `dryRun` is `false`. Standard JSON approval payload for sensitive `workspace-kit run` writes. |

## Returns

Success `data` includes:

- `dryRun`, `version`, `date`
- `changes[]` with the exact per-file replacement diff emitted by the deterministic script
- `releaseEvidenceRefs[]` for each changed artifact path
- `releaseEvidenceFragment` preview payload
- `releaseEvidenceFragmentPath` (`.workspace-kit/release-evidence/<version>/prepared-artifacts.json`)
- `releaseEvidenceFragmentWritten` (`true` only for apply mode)

## Structured Failures

- `prepare-release-artifacts-missing-version`
- `prepare-release-artifacts-policy-approval-required`
- `prepare-release-artifacts-script-failed`
- script-originated failures such as `ambiguous-edit` or `ambiguous-changelog-section`

## Related

- `release-evidence-manifest`
- `derive-publish-artifacts`
- `derive-validations`
- `scripts/prepare-release-artifacts.mjs`
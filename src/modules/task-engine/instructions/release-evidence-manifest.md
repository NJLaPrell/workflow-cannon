<!--
agentCapsule|v=1|command=release-evidence-manifest|module=task-engine|schema_only=pnpm exec wk run release-evidence-manifest --schema-only '{}'
-->

# release-evidence-manifest

Build a machine-readable release evidence manifest for phase closeout. This is a read-only command: it validates supplied approval/release-note/follow-up evidence and aggregates task delivery evidence from the task store.

## Usage

Full inline payload (unchanged):

```
workspace-kit run release-evidence-manifest '{"phaseKey":"74","approval":{...},"releaseNotes":{...},"followUpScan":{...},"followUpTasks":[]}'
```

Incremental assembly:

1. Derive fragments: `derive-validations`, `derive-publish-artifacts` (write JSON under `.workspace-kit/release-evidence/<version>/`).
2. Merge fragments + inline overrides:

```
workspace-kit run release-evidence-manifest '{"merge":true,"releaseVersion":"0.97.0","approval":{...},"releaseNotes":{...},"followUpScan":{...}}'
```

Or load a single partial file:

```
workspace-kit run release-evidence-manifest '{"fromFile":".workspace-kit/release-evidence/0.97.0/approval.json","merge":true,"releaseVersion":"0.97.0"}'
```

`merge: true` reads all `*.json` files in `.workspace-kit/release-evidence/<releaseVersion>/` (or `mergeDir`), then applies inline args on top.

## Arguments

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `phaseKey` | string | no | Phase key used to collect completed task delivery evidence. |
| `releaseVersion` | string | no | Defaults to `package.json` `version` when omitted. |
| `packageName` | string | no | Defaults to `package.json` `name` when omitted. |
| `git` | object | no | Git refs/tags/SHAs relevant to the release. |
| `approval` | object | yes | Human publish approval, separate from Tier A/B `policyApproval`. Requires `actor`, `timestamp`, `rationale`, and `scope`. |
| `releaseNotes` | object | yes | Agent-readable changelog/release-note evidence. Requires `source` and non-empty `entries[]`. |
| `validations` | object[] | no | Validation command/artifact records. |
| `risks` | object[] | no | Known risks/caveats/migration/security notes. |
| `publishArtifacts` | object[] | no | Tag, GitHub release, npm package, CI publish run, or similar proof. May be empty before publish. |
| `readinessChecks` | object[] | no | Bounded release readiness findings with exact remediation refs for version, changelog, schema mirror, and publish-state checks. |
| `followUpScan` | object | yes | Requires `scannedAt`. If `followUpTasks` is empty, also requires `rationale` so agents cannot claim zero follow-ups without evidence. |
| `followUpTasks` | object[] | no | Follow-up task references. Each `taskId` must exist in the task engine when supplied. |
| `fromFile` | string | no | Path to a partial JSON object merged before inline args. |
| `merge` | boolean | no | When `true`, merge all `*.json` under `.workspace-kit/release-evidence/<releaseVersion>/`. |
| `mergeDir` | string | no | Override fragment directory (default `.workspace-kit/release-evidence/<releaseVersion>/`). |

## Returns

Success `data.manifest` includes:

- `schemaVersion`, `createdAt`, `releaseVersion`, `packageName`, `phaseKey`
- `git`, `approval`, `releaseNotes`, `validations`, `risks`, `publishArtifacts`, `readinessChecks`
- `taskDeliveryEvidence[]` using the `metadata.deliveryEvidence` / `metadata.deliveryWaiver` vocabulary from `phase-delivery-preflight`
- `followUpScan`, `followUpTasks[]`, and `followUpSummary`

## Structured Failures

- `release-evidence-missing-approval`
- `release-evidence-missing-release-notes`
- `release-evidence-followup-scan-required`
- `release-evidence-followup-task-missing`
- `release-evidence-delivery-violations`
- `release-evidence-missing-version`
- `release-evidence-missing-package`

## Related

- `derive-validations` / `derive-publish-artifacts` — emit partial JSON fragments for merge mode.
- `phase-delivery-preflight` — validates completed task delivery evidence before closeout.
- `.ai/RELEASING.md` — release evidence gates and human approval boundary.
- `.ai/playbooks/phase-closeout-and-release.md` — phase closeout workflow.

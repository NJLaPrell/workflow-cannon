<!--
agentCapsule|v=1|command=release-closeout-result|module=task-engine|schema_only=pnpm exec wk run release-closeout-result --schema-only '{}'
-->

# release-closeout-result

Build the final, bounded release closeout result packet for an orchestrator or agent prompt. The command returns a ready-to-paste Markdown report with no placeholder tokens, plus concrete refs for the evidence used to fill each field.

## Usage

```bash
pnpm exec wk run release-closeout-result '{"phaseKey":"130","releaseVersion":"0.99.27","releaseNotes":{"source":"release-evidence-manifest.releaseNotes","entries":["Added final release result packets."]},"followUpSummary":{"count":0,"scannedAt":"2026-06-03T21:00:00.000Z","rationale":"No follow-up execution tasks recorded."}}'
```

You may also pass a prior `release-evidence-manifest` `data.manifest` payload as `manifest` or `releaseEvidenceManifest`. Inline fields override manifest defaults.

## Arguments

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `phaseKey` | string | no | Defaults to the canonical workspace phase when available. |
| `releaseVersion` | string | no | Defaults to manifest `releaseVersion` or `package.json` `version`. |
| `packageName` | string | no | Defaults to manifest `packageName` or `package.json` `name`. |
| `manifest` / `releaseEvidenceManifest` | object | no | Prior `release-evidence-manifest` manifest payload. |
| `releaseNotes.source` | string | yes | Concrete source label for shipped feature bullets. |
| `releaseNotes.entries[]` | string[] | yes | Short shipped-work bullets. Returned as `- ...` lines. |
| `followUpSummary.count` | number | no | Defaults to `followUpTasks.length`. |
| `followUpSummary.scannedAt` | string | yes | Evidence timestamp for follow-up scan. |
| `followUpSummary.rationale` | string | required when count is 0 | Rationale supporting `none` follow-on tasks. |
| `followUpTasks[]` | object[] | no | Bounded follow-on task refs for the optional Notes block. |
| `risks[]` | object[] | no | Bounded risk/issue notes using `label`/`code` and `message`/`description`. |

## Response highlights (`data`)

- `packetKind: "releaseCloseoutResult"`
- `phaseKey`, `releaseVersion`, `packageName`, `planningGeneration`
- `finalReport.markdown` — placeholder-free Markdown report
- `finalReport.fields` — populated values for the former phase summary template slots
- `releaseEvidence` — bounded feature, follow-up, and risk evidence
- `refs.commandSequence[]` — packet-first prompt chain:
  - `phase-release-orchestration-state`
  - `phase-drain-delta`
  - `prepare-release-artifacts`
  - `release-closeout-result`
- `refs.concreteRefs[]` — evidence refs for completed task count, features, and follow-up count

## Structured failures

- `release-closeout-result-insufficient-evidence` — the command cannot build a placeholder-free final report from the provided args and manifest defaults.
- `release-closeout-result-placeholder-token` — provided evidence would leave `{` or `}` braces in the final report.

## Related

- `phase-release-orchestration-state`
- `phase-drain-delta`
- `prepare-release-artifacts`
- `release-evidence-manifest`

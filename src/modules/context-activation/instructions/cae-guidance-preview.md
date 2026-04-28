# cae-guidance-preview

Friendly read-only Guidance preview for dashboard users. This command accepts
task/workflow inputs, builds bounded CAE evaluation context, evaluates CAE, and
returns grouped Guidance cards so UI clients do not have to construct
`evaluationContext` JSON directly.

```bash
workspace-kit run cae-guidance-preview '{"schemaVersion":1,"taskId":"T921","commandName":"get-next-actions","evalMode":"shadow"}'
```

## Args

| Field | Required | Notes |
| --- | --- | --- |
| `schemaVersion` | yes | Must be `1`. |
| `commandName` | yes | `workspace-kit run` command/workflow name to preview. |
| `taskId` | no | `T###` task id. When present, CAE hydrates the bounded task slice from kit SQLite if available. |
| `moduleId` | no | Optional module id override; otherwise inferred from the builtin command manifest when possible. |
| `commandArgs` | no | Bounded command args object used for policy sensitivity and argv summary. |
| `argvSummary` | no | Optional pre-summarized argv string. |
| `currentKitPhase` | no | Optional phase override; defaults to effective `kit.currentPhaseNumber` or `"0"`. |
| `evalMode` | no | `"shadow"` (default, rendered as Preview mode) or `"live"`. |
| `draftRule` / `draftGuidanceRule` | no | Optional authoring-shape JSON (**`schemaVersion: 1`**, **`title`**, **`family`**, **`priority`**, **`scopeDraft`**, optional **`acknowledgement`**, **`artifactType`**, **`refPath`**). When present, CAE overlays a validated in-memory artifact + activation on the loaded registry and returns **`data.draftImpact`** (baseline vs overlay sampled family counts). Responses set **`data.ephemeral: true`** and skip durable **`storeCaeSession`** / CAE trace snapshot writes — the draft overlay does not mutate JSON/SQLite registry versions or audits. Alias **`draftGuidanceRule`** mirrors **`draftRule`**. |

## Returns

`ok: true`, `code: "cae-guidance-preview-ok"`, and `data.schemaVersion: 1`.

The `data` object includes the underlying `evaluationContext`, `bundle`, `trace`,
`traceId`, grouped `guidanceCards`, `familyCounts`, `pendingAcknowledgements`,
and `conflictShadowSummary`.

When **`draftRule`** / **`draftGuidanceRule`** is sent, **`data`** also includes **`draftImpact`**:
**`schemaVersion`**, **`draftArtifactId`**, **`draftActivationId`**, **`scopePreset`**, **`scopePlainSummary`**,
 **`overlayRegistryDigestSnippet`**, **`scopeWarnings`**, **`scopeErrors`**, **`broadScopeWarnings`**, **`primarySampleLabel`**, **`samples`** (rows with optional **`sampleKind`**, **`baselineFamilyCounts`** / **`overlayFamilyCounts`**, **`draftVisibleInOverlay`**), **`blastRadiusSummary`** (draft-scope category, sample match counts/tallies across representative workloads **plus bounded ready/in-progress kit tasks**, representative labels), **`activationReadiness`** (**`level`**: `ok` | `warning` | `stop_confirm`, conflict/conflict-draft counts, usefulness signal vs baseline acknowledgement delta, rationale **`reasons`**). **`bundle`** / **`guidanceCards`** reflect evaluation against the overlaid registry in that mode.

This command is Tier C / read-only and does not accept `policyApproval`.

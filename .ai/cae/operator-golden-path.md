# CAE operator golden path

This is the v1 smoke path for proving Context Activation Engine behavior without reading implementation code. Run commands from the workspace root and prefer `pnpm exec wk` when scripts need clean JSON stdout.

## 1. Health

```bash
pnpm exec wk run cae-health '{"schemaVersion":1,"includeDetails":true}'
```

Success is `ok: true`, `code: "cae-health-ok"`, `data.registryStatus: "ok"`, and a non-empty `activeRegistryVersionId` when `kit.cae.registryStore` is `sqlite`.

If `traceRowCount > 0` while `lastEvalAt` is `null`, that is not a contradiction: `lastEvalAt` is process-local, while trace rows are durable SQLite snapshots.

## 2. Registry Validation

```bash
pnpm exec wk run cae-registry-validate '{"schemaVersion":1}'
```

Success includes `registryContentHash`, `artifactCount`, and `activationCount`. With the default SQLite registry, this validates the active SQLite version. JSON under `.ai/cae/registry/` is seed and fixture input, not runtime authority.

## 3. Representative Evaluation

```bash
pnpm exec wk run cae-evaluate '{"schemaVersion":1,"evalMode":"shadow","evaluationContext":{"schemaVersion":1,"task":{"taskId":"T921","status":"in_progress","phaseKey":"70","title":"CAE operator golden path","tags":["cae"],"metadata":{"phaseProgram":"phase-70-cae-follow-on","risk":"medium"}},"command":{"name":"get-next-actions","moduleId":"task-engine","argvSummary":"{}"},"workspace":{"currentKitPhase":"70"},"governance":{"policyApprovalRequired":false,"approvalTierHint":"C"},"queue":{"readyQueueDepth":0,"suggestedNextTaskId":"T921"},"mapSignals":null}}'
```

Success is `code: "cae-evaluate-ok"` with a `traceId`, `bundle`, and `trace`. In shadow mode, `bundle.shadowObservation.wouldActivate[]` shows what would surface.

## 4. Explain Or Fetch The Trace

Use explain when a human wants the short story:

```bash
pnpm exec wk run cae-explain '{"schemaVersion":1,"traceId":"<traceId>","level":"summary"}'
```

Use trace retrieval when automation needs the raw trace:

```bash
pnpm exec wk run cae-get-trace '{"schemaVersion":1,"traceId":"<traceId>"}'
```

When `kit.cae.persistence` is true, a trace from an earlier process can be loaded from SQLite. When persistence is false, expect `ephemeral: true` and same-process retrieval only.

## 5. Conflict Inspection

```bash
pnpm exec wk run cae-conflicts '{"schemaVersion":1,"evalMode":"shadow","evaluationContext":{"schemaVersion":1,"task":{"taskId":"T921","status":"in_progress","phaseKey":"70","tags":["cae"]},"command":{"name":"document-project","moduleId":"documentation","argvSummary":"{\"options\":{\"dryRun\":true}}"},"workspace":{"currentKitPhase":"70"},"governance":{"policyApprovalRequired":false,"approvalTierHint":"C"},"queue":{"readyQueueDepth":0},"mapSignals":null}}'
```

Success returns `conflictShadowSummary`. Empty `entries[]` means no same-family tie was detected for that context.

## Read-Only vs Governed Mutation

Read-only inspection commands do not require `policyApproval`: `cae-health`, `cae-registry-validate`, `cae-list-artifacts`, `cae-list-activations`, `cae-evaluate`, `cae-explain`, `cae-get-trace`, `cae-conflicts`, `cae-list-acks`, and `cae-shadow-feedback-report`.

Governed mutation commands still require their own approval lane:

```bash
pnpm exec wk run cae-satisfy-ack '{"schemaVersion":1,"traceId":"<traceId>","activationId":"cae.activation.policy.phase70-playbook","ackToken":"phase70-policy-surface","actor":"operator@example","policyApproval":{"confirmed":true,"rationale":"record CAE acknowledgement satisfaction"}}'
```

CAE acknowledgement is not Tier A/B `policyApproval`. If a command is sensitive, pass `policyApproval` to that command even if CAE acknowledgement was satisfied.

## Bad Paths And Recovery

| Symptom / code | Meaning | Next command |
| --- | --- | --- |
| `cae-kit-sqlite-unavailable` | The configured kit SQLite DB is missing or not openable. | Run `pnpm exec wk doctor`, then inspect `tasks.sqliteDatabaseRelativePath`. |
| `cae-registry-sqlite-not-ready` | Workspace DB predates CAE registry tables. | Run the normal workspace-kit upgrade/init path before CAE registry commands. |
| `cae-registry-no-active-version` | SQLite registry tables exist but no version is active. | Run `pnpm exec wk run cae-import-json-registry '{"schemaVersion":1,"actor":"operator","policyApproval":{"confirmed":true,"rationale":"seed active CAE registry"}}'`. |
| `cae-registry-read-error` | JSON seed files are missing when explicitly using `registryStore: "json"`. | Restore `.ai/cae/registry/*.json` or switch back to SQLite registry authority. |
| `cae-registry-validation-error` | Registry rows are malformed or reference missing artifacts. | Run `pnpm exec wk run cae-registry-validate '{"schemaVersion":1}'`, then inspect the reported row/path. |
| `cae-trace-not-found` | Trace is not in memory or persisted SQLite. | Re-run `cae-evaluate` with persistence on when cross-process retrieval is needed. |
| `cae-persistence-disabled` | Ack satisfaction requires durable trace persistence. | Enable `kit.cae.persistence`, evaluate again, then satisfy the ack. |

When in doubt, run health, validate registry, evaluate one context, then explain the returned trace. If that loop works, CAE is alive.

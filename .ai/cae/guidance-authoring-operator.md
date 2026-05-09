# Guidance Authoring Operator Runbook

Use this runbook to validate the Guidance authoring MVP and recover from the expected failure modes without reading implementation code. Run commands from the repository root. Prefer `pnpm exec wk run ...` for clean JSON output.

## Preconditions

- Build first when command code changed: `pnpm run build`.
- The workspace uses SQLite registry authority: `kit.cae.registryStore: "sqlite"`.
- Authoring mutations are intentionally enabled only in a disposable or reviewed workspace: `kit.cae.adminMutations: true`.
- Every authoring mutation includes `actor`, `caeMutationApproval.confirmed: true`, and a rationale.
- UI smoke checks run through the Cursor extension command **Workflow Cannon: Open Guidance Authoring**.

Do not use the authoring UI to bypass git review or release policy. Treat it as a governed registry editor with audit rows, stale-state checks, and preview evidence.

## Readiness Smoke

1. Confirm CAE health and registry authority.

```bash
pnpm exec wk run cae-health '{"schemaVersion":1,"includeDetails":true}'
pnpm exec wk run cae-registry-validate '{"schemaVersion":1}'
```

2. Confirm the authoring aggregate is available.

```bash
pnpm exec wk run cae-authoring-summary '{"schemaVersion":1}'
```

Expected result: `ok: true`, `code: "cae-authoring-summary-ok"`, an active version with a `registryDigest`, artifact and activation counts, validation state, recent mutation availability, and `readiness` fields.

3. Open the authoring panel in the extension. Confirm the first panel shows one of these explicit states:

- **Guidance authoring is ready** for a healthy SQLite registry.
- **Authoring is read-only** when the registry store is not SQLite or admin mutations are disabled.
- **No active guidance set** when SQLite has no active version.
- **Native SQLite is unavailable** when the extension cannot load the native SQLite runtime.
- **Guidance registry needs attention** when validation warnings or invalid refs exist.

4. Use the panel tabs to inspect Overview, Artifacts, Activations, Preview, and Audit. The smoke path passes when each tab renders without raw stack traces and the Audit tab shows recent mutation rows or an explicit empty/audit-unavailable state.

## Authoring Loop Smoke

Run the mutation loop only in a disposable workspace or a branch intended for review.

1. Refresh the panel and note the active version and registry digest.
2. Create or duplicate a workspace-owned source rule/playbook from the Artifacts tab.
3. Create a draft activation that references the artifact.
4. Use Preview to collect preview evidence for the draft.
5. Activate the draft, then disable or retire it if the smoke object should not remain live.
6. Refresh and confirm the Audit tab records each mutation with actor and rationale.
7. Run validation again.

```bash
pnpm exec wk run cae-authoring-summary '{"schemaVersion":1}'
pnpm exec wk run cae-registry-validate '{"schemaVersion":1}'
```

The loop passes when the panel never asks for hidden JSON, stale writes are blocked, preview evidence gates broad activation, and audit rows make the mutation history reconstructable.

## Failure Recovery

| Symptom / code | What it means | Recovery |
| --- | --- | --- |
| `cae-stale-state` | The active version or registry digest changed after the panel loaded. | Click **Refresh**, review Audit for the newer mutation, then retry from the latest state. |
| `cae-mutation-admin-off` | `kit.cae.adminMutations` is not enabled. | Leave production read-only, or intentionally enable admin mutations in a disposable/reviewed workspace and refresh. |
| `cae-mutation-json-store` | The workspace is using JSON seed files instead of SQLite authority. | Set `kit.cae.registryStore` to `sqlite`, ensure an active SQLite version exists, then refresh. |
| `cae-kit-sqlite-unavailable` | Native SQLite is missing, mismatched, or not loadable by the selected Node runtime. | Run `pnpm rebuild better-sqlite3`, ensure the extension uses the same Node family as the workspace, then reopen/reload. |
| `cae-registry-no-active-version` | SQLite registry tables exist but no version is active. | Import or activate a reviewed registry version before authoring. |
| `cae-registry-validation-error` | Registry rows are malformed or references are invalid. | Run `pnpm exec wk run cae-registry-validate '{"schemaVersion":1}'`, fix the reported artifact/activation, then refresh. |
| `cae-preview-evidence-required` | A broad or policy-family activation was submitted without fresh preview evidence. | Run Preview for the draft in the panel, review the result, then activate from that refreshed evidence. |
| `cae-activation-invalid-artifact-ref` | A draft activation references an artifact id that is missing or retired. | Pick an active artifact from the panel list or restore the referenced artifact before retrying. |
| Missing workspace file | A workspace-authored artifact points at a file that is absent. | Restore the file, update the artifact path, or retire the artifact before activation. |
| Disabled controls with no failure toast | The panel is honoring a read-only precondition. | Read the top callout first; fix the readiness condition and refresh. |

## Release Evidence Checklist

Capture these facts in the task or release evidence before claiming the CAE authoring MVP is releasable:

- Branch / PR link and merge commit.
- Local validation: `pnpm run build`, `pnpm --filter cursor-workflow-cannon test`, `pnpm run test`, and `pnpm run check`.
- CI validation: `test` green with release-readiness steps included, and `parity` green.
- Authoring summary output was checked for active version, registry digest, validation state, readiness, and recent mutation availability.
- Panel smoke covered Overview, Artifacts, Activations, Preview, and Audit.
- At least one expected degraded state was verified or reviewed from tests: stale state, disabled mutation, invalid refs, read-only JSON store, missing active version, or native SQLite failure.
- Mutation smoke, if performed, used a disposable/reviewed workspace and left audit rows with actor and rationale.

If a manual UI smoke was not run, say so explicitly and cite the automated renderer/message-handler coverage that substituted for it.

## Related

- `.ai/cae/operator-golden-path.md` - CAE read-only health/evaluation smoke.
- `.ai/cae/registry-mutation-governance.md` - mutation preconditions and approval boundary.
- `.ai/cae/workspace-artifacts.md` - workspace-owned artifact file rules.
- `.ai/cae/dashboard-guidance-plan.md` - Guidance product surface and phase evidence.
- `src/modules/context-activation/instructions/cae-authoring-summary.md` - authoring aggregate command contract.

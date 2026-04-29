<!--
agentCapsule|v=1|command=document-project|module=documentation|schema_only=pnpm exec wk run document-project --schema-only '{}'
-->

# document-project

Generate all project documentation by running `generate-document` for every view model in `src/modules/documentation/views`. Outputs AI-optimized docs to `.ai/` and human-readable docs to `docs/maintainers/`. When the batch includes `README.md`, also refreshes **repo-root `README.md`** (same transforms as single-doc `generate-document`).

## Inputs

- `options` (all optional):
  - `dryRun?: boolean` — compute outputs/validations without writing files
  - `overwriteAi?: boolean` — overwrite existing AI docs (default `false`)
  - `overwriteHuman?: boolean` — overwrite existing human docs (default `true`)
  - `strict?: boolean` — fail on unresolved warnings (default `false` in batch mode)
  - `maxValidationAttempts?: number` — override retry limit per document

## Shipped targets

View models in `src/modules/documentation/views` map to these output targets:

- `AGENTS.md`
- `ARCHITECTURE.md`
- `PRINCIPLES.md`
- `README.md` (`.ai/README.md` + `docs/maintainers/README.md` + **repo-root `README.md`** — see `generate-document.md`)
- `RELEASING.md`
- `ROADMAP.md`
- `SECURITY.md`
- `SUPPORT.md`
- `TERMS.md`
- `runbooks/parity-validation-flow.md`
- `runbooks/consumer-cadence.md`
- `runbooks/release-channels.md`
- `workbooks/transcript-automation-baseline.md`
- `workbooks/phase2-config-policy-workbook.md`
- `workbooks/task-engine-workbook.md`

## Required behavior

1. Discover all `.view.yaml` view models (fallback: discover templates in fixture workspaces without `views/`).
2. For each view model, invoke `generate-document` using the view model `target` as `documentType`.
3. Default overwrite behavior: **preserve AI docs** (`overwriteAi: false`), **overwrite human docs** (`overwriteHuman: true`).
4. Continue through all targets on individual failure; do not stop the batch.
5. Collect per-document results and emit a batch summary with total/succeeded/failed/skipped counts.
6. Return `ok: true` only when zero documents failed.

## Skipped AI doc handling

When AI docs are skipped because they already exist (`filesSkipped` is non-empty in a document result), the calling agent **must** prompt the user before overwriting. Present the list of skipped AI doc paths and ask for explicit confirmation. If confirmed, re-run with `overwriteAi: true` for those documents.

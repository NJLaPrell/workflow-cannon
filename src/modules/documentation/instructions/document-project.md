# document-project

Generate all project documentation by running `generate-document` for every template in the template library. Outputs AI-optimized docs to `.ai/` and human-readable docs to `docs/maintainers/`.

## Inputs

- `options` (all optional):
  - `dryRun?: boolean` — compute outputs/validations without writing files
  - `overwriteAi?: boolean` — overwrite existing AI docs (default `false`)
  - `overwriteHuman?: boolean` — overwrite existing human docs (default `true`)
  - `strict?: boolean` — fail on unresolved warnings (default `false` in batch mode)
  - `maxValidationAttempts?: number` — override retry limit per document

## Shipped templates

All `.md` files under `sources.templatesRoot` (default `src/modules/documentation/templates`) are processed:

- `AGENTS.md`
- `ARCHITECTURE.md`
- `PRINCIPLES.md`
- `README.md`
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

1. Discover all `.md` templates in `sources.templatesRoot`.
2. For each template, invoke `generate-document` with the template basename as `documentType`.
3. Default overwrite behavior: **preserve AI docs** (`overwriteAi: false`), **overwrite human docs** (`overwriteHuman: true`).
4. Continue through all templates on individual failure; do not stop the batch.
5. Collect per-document results and emit a batch summary with total/succeeded/failed/skipped counts.
6. Return `ok: true` only when zero documents failed.

## Skipped AI doc handling

When AI docs are skipped because they already exist (`filesSkipped` is non-empty in a document result), the calling agent **must** prompt the user before overwriting. Present the list of skipped AI doc paths and ask for explicit confirmation. If confirmed, re-run with `overwriteAi: true` for those documents.

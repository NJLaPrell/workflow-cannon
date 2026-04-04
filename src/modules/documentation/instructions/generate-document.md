# generate-document

Generate a single document for both canonical AI and human-readable surfaces using module config, schema, view models, and deterministic renderers.

## Inputs

- `documentType` (required): basename of the doc to generate; should match a `target` declared in `src/modules/documentation/views/*.view.yaml`. Known targets:
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
- `options`:
  - `dryRun?: boolean` — compute outputs/validations without writing files
  - `overwrite?: boolean` — allow replacing existing files (default `true`)
  - `overwriteAi?: boolean` — override `overwrite` for AI surface only
  - `overwriteHuman?: boolean` — override `overwrite` for human surface only
  - `strict?: boolean` — fail on unresolved warnings (default `true`)
  - `maxValidationAttempts?: number` — override retry limit
  - `allowWithoutTemplate?: boolean` — continue without template only when explicitly confirmed

## Required behavior

1. Read `src/modules/documentation/RULES.md` and apply precedence order before generation.
2. Load module config and resolve output roots from configured paths (`sources.aiRoot`, `sources.humanRoot`).
3. Restrict writes strictly to configured output roots; reject writes outside those roots.
4. Resolve template for `documentType` from `sources.templatesRoot` (for section/coverage checks) and resolve matching view model target from `views/`.
5. If template is missing, warn user and ask whether to continue without a template; continue only on explicit confirmation.
6. Generate AI output first at `<aiRoot>/<documentType>` using `documentation-maintainer.md` + `documentation-schema.md`.
7. Validate AI output against schema; on validation failure, auto-resolve/retry up to `generation.maxValidationAttempts` before failing.
8. Parse AI output into keyed records, validate schema, normalize typed model, then render human output via named renderer functions from the matched view model.
9. For templates containing `{{{ ... }}}`, execute block contents as generation instructions and ensure no unresolved blocks remain in output.
10. Run section coverage validation (all required sections present, correct headings/order where required); retry/resolve on failure.
11. Detect conflicts with higher-precedence docs and stop/prompt when policy-sensitive or unresolved.
12. Emit run evidence: inputs, files read/written, validation results, retries used, conflict outcomes, timestamp.

## Response template (CLI shaping)

For **`documentType`** **`ROADMAP.md`** or **`FEATURE-TAXONOMY.md`**, a successful non-dry-run applies the builtin **`phase_ship`** response template by default (unless you override via **`responseTemplateId`** / directive / **`commandOverrides`**), adding **`data.presentation.matchedSections`** for evidence keys such as **`filesWritten`**. See **`docs/maintainers/response-template-contract.md`**.

# Documentation Module

Translates between canonical AI-optimized documentation and human-readable maintainership docs.

Primary responsibilities:

- maintain parity between `/.ai` and configured human docs roots (default: `docs/maintainers`)
- execute instruction-file driven documentation generation
- record deterministic documentation generation state and evidence

See `src/modules/documentation/RULES.md` for the canonical usage order and validation rules.

## Callable commands

Registered on the documentation module and dispatched through `src/core/module-command-router.ts`:

- `document-project` — batch: generate **all** project docs from the template library. Outputs AI docs to `.ai/` (preserving existing) and human docs to `docs/maintainers/` (overwriting). Continues through failures; reports batch summary. See `instructions/document-project.md`.
- `generate-document` — single: generate **one** document by `documentType`. See `instructions/generate-document.md`.

## Shipped templates

Files under `templates/`; `documentType` is the filename (basename). Keep this list aligned with `instructions/document-project.md` **Inputs**:

- `AGENTS.md`
- `ARCHITECTURE.md`
- `PRINCIPLES.md`
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

Adding a new template: add `templates/<Name>.md`, extend the **Inputs** list in `instructions/document-project.md`, and add the same line here.

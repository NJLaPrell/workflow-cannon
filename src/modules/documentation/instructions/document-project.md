# document-project

Generate project documentation for both canonical AI and human-readable surfaces using module config, schema, and templates.

## Inputs

- `documentType`: basename of the doc to generate; must match a file under `sources.templatesRoot` (default `src/modules/documentation/templates`). Known templates:
  - `AGENTS.md`
  - `ARCHITECTURE.md`
  - `PRINCIPLES.md`
  - `RELEASING.md`
  - `ROADMAP.md`
  - `SECURITY.md`
  - `SUPPORT.md`
  - `TERMS.md`
- Requested scope and optional generation options (`dryRun`, `overwrite`, `strict`)
- Project context from `.ai/PRINCIPLES.md`, `docs/maintainers/TASKS.md`, and `README.md`

## Required behavior

1. Read `src/modules/documentation/RULES.md` and apply precedence order before generation.
2. Load module config and resolve output roots from configured paths (`sources.aiRoot`, `sources.humanRoot`).
3. Restrict writes strictly to configured output roots; reject writes outside those roots.
4. Resolve template for `documentType` from `sources.templatesRoot`.
5. If template is missing, warn user and ask whether to continue without a template; continue only on explicit confirmation.
6. Generate AI output first at `<aiRoot>/<documentType>` using `documentation-maintainer.md` + `documentation-schema.md`.
7. Validate AI output against schema; on validation failure, auto-resolve/retry up to `generation.maxValidationAttempts` before failing.
8. Re-read generated AI output with project context, then generate human output at `<humanRoot>/<documentType>`.
9. For templates containing `{{{ ... }}}`, execute block contents as generation instructions and ensure no unresolved blocks remain in output.
10. Run section coverage validation (all required sections present, correct headings/order where required); retry/resolve on failure.
11. Detect conflicts with higher-precedence docs and stop/prompt when policy-sensitive or unresolved.
12. Emit run evidence: inputs, files read/written, validation results, retries used, conflict outcomes, timestamp.

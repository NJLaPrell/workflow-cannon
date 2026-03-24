# Documentation Module

Translates between canonical AI-optimized documentation and human-readable maintainership docs.

Primary responsibilities:

- maintain parity between `/.ai` and configured human docs roots (default: `docs/maintainers`)
- execute instruction-file driven documentation generation
- record deterministic documentation generation state and evidence

See `src/modules/documentation/RULES.md` for the canonical usage order and validation rules.

## Callable commands

Registered on the documentation module and dispatched through `src/core/module-command-router.ts`:

- `document-project` / `generate-document` — generate a paired AI-surface and human-surface document from a template and project context. Behavior and inputs: `instructions/document-project.md`.

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

Adding a new template: add `templates/<Name>.md`, extend the **Inputs** list in `instructions/document-project.md`, and add the same line here.

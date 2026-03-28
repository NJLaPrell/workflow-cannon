# Documentation Module

Translates between canonical AI-optimized documentation and human-readable maintainership docs using a v2 keyed record pipeline.

Primary responsibilities:

- maintain parity between `/.ai` and configured human docs roots (default: `docs/maintainers`)
- execute instruction-file driven documentation generation
- record deterministic documentation generation state and evidence
- render human docs via view models and named deterministic renderers

See `src/modules/documentation/RULES.md` for the canonical usage order and validation rules.

## Callable commands

Registered on the documentation module and dispatched through `src/core/module-command-router.ts`:

- `document-project` — batch: generate all docs from `views/*.view.yaml` (with template fallback for fixture workspaces). See `instructions/document-project.md`.
- `generate-document` — single: generate one document by `documentType` and render through parser -> validator -> normalizer -> renderer. See `instructions/generate-document.md`.

## File layout

- `parser.ts` - keyed record parsing from AI docs
- `validator.ts` - schema/rule validation and auto-resolution
- `normalizer.ts` - typed normalized model + record indexes
- `renderer.ts` - deterministic named markdown renderers
- `view-models.ts` - view model loader and listing
- `views/*.view.yaml` - rendering section contracts per document target
- `runtime.ts` - orchestration and IO only

Adding a new document target: add/adjust `.ai/<doc>.md` source, create/update matching `views/*.view.yaml`, and ensure a matching template exists if section-coverage checks require it.

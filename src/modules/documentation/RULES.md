# Documentation Module Rules

Single entrypoint for how to use the documentation module.

## Precedence Order

When guidance conflicts, apply this order:

1. `/.ai/PRINCIPLES.md` (global governance and approval gates)
2. `/.ai/module-build.md` (module development and validation rules)
3. `src/modules/documentation/config.md` (module path policy and generation behavior)
4. `src/modules/documentation/instructions/document-project.md` (document generation workflow)
5. `src/modules/documentation/instructions/documentation-maintainer.md` (AI-doc generation policy)
6. `src/modules/documentation/schemas/documentation-schema.md` (record schema contract)
7. `src/modules/documentation/templates/*.md` (document-type generation templates)
8. `docs/maintainers/module-build-guide.md` (human-readable companion guidance)

## Usage Model

- Choose an instruction entry from `instructions/` for the operation you want.
- Discover available callable module operations through `src/core/module-command-router.ts` command listing.
- Load module config first and restrict writes to configured document paths.
- If a matching template exists, use it as the structure contract.
- For templates with `{{{ ... }}}` blocks, treat block content as generation instructions, not output text.
- Generate AI-surface content first, then generate human-surface content from that result plus project context.

## Command Contracts

### `document-project(options)` — batch

Generates all project docs by iterating every `.md` template in `sources.templatesRoot`.

- Default behavior: **preserve AI docs** (`overwriteAi: false`), **overwrite human docs** (`overwriteHuman: true`), continue on individual failure.
- Returns batch summary with total/succeeded/failed/skipped counts plus per-document results.

### `generate-document(documentType, options)` — single

Generates one document pair (AI + human) for the given `documentType`.

- `documentType`: required string basename resolving to `<templatesRoot>/<documentType>`.
- `options`:
  - `dryRun?: boolean` (default `false`) - compute outputs/validations without writing files
  - `overwrite?: boolean` (default `true`) - allow replacing existing files (both surfaces)
  - `overwriteAi?: boolean` - override `overwrite` for AI surface only
  - `overwriteHuman?: boolean` - override `overwrite` for human surface only
  - `strict?: boolean` (default `true`) - fail on unresolved warnings (validation/conflict/coverage)
  - `maxValidationAttempts?: number` (default from config) - override retry limit
  - `allowWithoutTemplate?: boolean` (default `false`) - continue without template only when explicitly confirmed
- Shipped template basenames are listed in `instructions/generate-document.md` and `instructions/document-project.md`.

### Shared semantics

- Both commands read paths from module config (`sources.aiRoot`, `sources.humanRoot`, `sources.templatesRoot`, `sources.instructionsRoot`, `sources.schemasRoot`).
- Both enforce write boundaries to configured output roots only.
- Both execute AI generation first, then human generation from AI output plus project context.
- Both return evidence objects containing files read/written, validations, retries, warnings/conflicts, and timestamp.

## Required Validation

- Validate AI output against `schemas/documentation-schema.md`.
- Verify section coverage for templated documents and ensure no unresolved `{{{` blocks remain.
- Detect conflicts against higher-precedence sources and stop/prompt when required.
- Emit run evidence (inputs, outputs, validation results, timestamp).

## Missing Template Behavior

- If a template for the requested document type is missing:
  - warn the user
  - ask whether to continue without a template
  - continue only with explicit confirmation

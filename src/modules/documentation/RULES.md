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
7. **`src/modules/documentation/schemas/*.schema.json`** — machine JSON Schema for **`data/roadmap-data.json`** and **`data/feature-taxonomy.json`** (validated in CI and before roadmap/taxonomy doc generation; see `data-schema-validate.ts`).
8. **`src/modules/documentation/views/*.view.yaml`** (document-type rendering contracts — each view lists **typed** `sections` with `source` + `renderer`; avoid duplicating long prose in templates when a view-model field suffices)
9. `docs/maintainers/module-build-guide.md` (human-readable companion guidance)

## Machine vs maintainer surfaces

- **Machine / AI-primary** records and keyed chat content live under **`.ai/`** (see documentation module config for `sources.aiRoot`).
- **Maintainer human render** under **`docs/maintainers/`** is **derived** from those records + view models + templates — agents run `generate-document` / `document-project`; drift vs `.ai` is gated in CI (`check-ai-to-docs-drift`, `check-orphan-ai-sources`).
- Prefer extending **structured** fields (record lines, JSON data, view `sections`) over pasting duplicate narrative into templates.

## Classification inventory + mechanical staleness (T100199)

- **Grouped Markdown inventory** — committed snapshot at `docs/maintainers/data/documentation-ledger.v1.json`, produced by `pnpm run build:documentation-ledger` (generator: `scripts/build-documentation-ledger.mjs`). Each group carries audience / lifecycle / canonical-source metadata; root `*.md` rows carry explicit disposition + rationale.
- **CI gate** — `pnpm run check:doc-lifecycle` (also runs as the `doc-lifecycle-report` stage in `pnpm run check`) validates: (1) repo-root `*.md` matches the CONTRIBUTING allowlist, (2) ledger JSON shape, (3) ledger `rootMarkdownFiles` matches the actual root `*.md` set on disk (catch a stale committed ledger after root moves).
- **Deletion / archive evidence register** — `docs/maintainers/data/documentation-deletion-register.v1.json` lists removed or archived paths with replacement, link survey notes, task/release refs, and package impact. CI runs `pnpm run check:documentation-deletion-register` (see `scripts/check-documentation-deletion-register.mjs`).
- **Governance repair map** — stage-by-stage remediation for documentation-related `pnpm run check` failures lives in **`.ai/runbooks/documentation-governance-checks.md`** (mirrored under `docs/maintainers/runbooks/`). CI also runs `pnpm run check:doc-governance-stages` to ensure core doc gates stay wired in `scripts/run-check-stages.mjs`.
- **Mirror pipeline vs documentation module** — `pnpm run generate-maintainer-docs-from-ai` + `check-ai-to-docs-drift` / `check-orphan-ai-sources` enforce the **`.ai` → `docs/maintainers` mirror** for covered paths. **`generate-document` / `document-project`** own **view-backed** maintainer markdown (ROADMAP, FEATURE-TAXONOMY, README bodies, etc.) from module data + templates — a different write surface; do not conflate the two when choosing where to edit sources.

## Usage Model

- Choose an instruction entry from `instructions/` for the operation you want.
- Discover available callable module operations through `src/core/module-command-router.ts` command listing.
- Load module config first and restrict writes to configured document paths.
- Resolve view model definitions first and treat them as the section/renderer contract.
- Generate AI-surface content first, then parse/validate/normalize records before human rendering.
- Human rendering must use named deterministic renderers only.

## Command Contracts

### `document-project(options)` — batch

Generates all project docs by iterating every `.view.yaml` in `src/modules/documentation/views` (falls back to template discovery in fixture workspaces without views).

- Default behavior: **preserve AI docs** (`overwriteAi: false`), **overwrite human docs** (`overwriteHuman: true`), continue on individual failure.
- Returns batch summary with total/succeeded/failed/skipped counts plus per-document results.

### `generate-document(documentType, options)` — single

Generates one document pair (AI + human) for the given `documentType`, and when `documentType` is `README.md`, also writes **repository-root `README.md`** (deterministic transforms from the maintainer human body).

- `documentType`: required string basename resolving to both AI and human output targets.
- `options`:
  - `dryRun?: boolean` (default `false`) - compute outputs/validations without writing files
  - `overwrite?: boolean` (default `true`) - human outputs; when `overwriteAi` is omitted, AI surface follows this flag as well
  - `overwriteAi?: boolean` - AI surface only; defaults to **`false`** (preserve existing `.ai/` files; read+validate instead of stub)
  - `overwriteHuman?: boolean` - override `overwrite` for human surface only
  - `overwriteRepoRootReadme?: boolean` - override `overwrite` for repo-root `README.md` only (`README.md` target only)
  - `strict?: boolean` (default `true`) - fail on unresolved warnings (validation/conflict/coverage)
  - `maxValidationAttempts?: number` (default from config) - override retry limit
  - `allowWithoutTemplate?: boolean` (default `false`) - continue without template only when explicitly confirmed
- Shipped view model files are listed by `listViewModels()` in `view-models.ts`.

### Shared semantics

- Both commands read paths from module config (`sources.aiRoot`, `sources.humanRoot`, `sources.templatesRoot`, `sources.instructionsRoot`, `sources.schemasRoot`).
- Both enforce write boundaries to configured output roots only.
- Both execute AI generation first, then human generation from parsed+normalized AI output plus view-model renderers.
- Both return evidence objects containing files read/written, validations, retries, warnings/conflicts, and timestamp.

## Required Validation

- Validate AI output against `schemas/documentation-schema.md`.
- Verify section coverage for template-backed content and ensure no unresolved `{{{` blocks remain.
- Detect conflicts against higher-precedence sources and stop/prompt when required.
- Emit run evidence (inputs, outputs, validation results, timestamp).

## Missing Template Behavior

- If a template for the requested document type is missing:
  - warn the user
  - ask whether to continue without a template
  - continue only with explicit confirmation

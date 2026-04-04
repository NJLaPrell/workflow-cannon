# Response template contract

Version **1** (`RESPONSE_TEMPLATE_CONTRACT_VERSION`). Defines how `workspace-kit run` JSON results can carry advisory presentation metadata without changing module-level success semantics by default.

## Enforcement modes

- **advisory** (default): Unknown template ids emit short warnings in `responseTemplate.warnings` and never flip `ok`.
- **strict**: An explicit `responseTemplateId`, instruction directive, or per-command override that does not resolve to a builtin template sets `ok: false` and `code: response-template-invalid`.

## Builtin template ids

Registered in runtime (`listBuiltinResponseTemplateIds`): includes `default`, `compact`, `completed_task`, `COMPLETED_TASK` (plain-English alias), and **`phase_ship`** (contextual phase closeout / release shaping).

## Resolution order (single precedence chain)

Applied in **`src/core/response-template-shaping.ts`** (`applyResponseTemplateApplication`). First non-null wins for the **requested** id before builtin registry validation:

1. JSON arg **`responseTemplateId`** (explicit string).
2. First plain-English hit, in order: **`responseTemplateDirective`**, **`instructionTemplateDirective`**, **`instruction`** (parsed by `parseTemplateDirectiveFromText` in `src/core/instruction-template-mapper.ts`).
3. **`responseTemplates.commandOverrides[commandName]`** from effective config.
4. **Contextual `phase_ship`** — `resolveContextualResponseTemplateId` in **`src/core/response-template-shaping.ts`** returns **`phase_ship`** when:
   - **`run-transition`** and **`action`** is **`complete`**; or
   - **`update-workspace-phase-snapshot`** and **`dryRun`** is not **`true`**; or
   - **`generate-document`** with **`documentType`** **`ROADMAP.md`** or **`FEATURE-TAXONOMY.md`** and **`options.dryRun`** is not **`true`**.
5. Builtin manifest default for the command (**`defaultResponseTemplateId`** in **`src/contracts/builtin-run-command-manifest.json`**), when set.
6. **`responseTemplates.defaultTemplateId`** from effective config (kit default string **`default`** when unset).
7. Literal fallback **`default`**.

**Explicit vs plain-English:** If both **`responseTemplateId`** and a directive field resolve to different template ids, **advisory** mode warns and keeps the **explicit** id; **strict** mode fails with **`response-template-conflict`** and names the directive field that disagreed.

**Strict unknown template:** **`response-template-invalid`** messages include **which precedence step** chose the unresolved id (e.g. JSON arg vs `defaultTemplateId`).

## Output shape

`ModuleCommandResult.responseTemplate`:

- `requestedTemplateId`, `appliedTemplateId`, `enforcementMode`, `warnings[]` (each line ≤ 120 chars)
- `telemetry`: `resolveNs`, `warningCount`

When a template applies, `data.presentation` may list `matchedSections` for expected keys.

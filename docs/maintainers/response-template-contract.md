# Response template contract

Version **1** (`RESPONSE_TEMPLATE_CONTRACT_VERSION`). Defines how `workspace-kit run` JSON results can carry advisory presentation metadata without changing module-level success semantics by default.

## Enforcement modes

- **advisory** (default): Unknown template ids emit short warnings in `responseTemplate.warnings` and never flip `ok`.
- **strict**: An explicit `responseTemplateId`, instruction directive, or per-command override that does not resolve to a builtin template sets `ok: false` and `code: response-template-invalid`.

## Builtin template ids

Registered in runtime (`listBuiltinResponseTemplateIds`): includes `default`, `compact`, `completed_task`, and `COMPLETED_TASK` (plain-English alias).

## Resolution order

1. JSON arg `responseTemplateId`
2. First match from `responseTemplateDirective`, `instructionTemplateDirective`, or `instruction` (plain-English; see `parseTemplateDirectiveFromText`)
3. `responseTemplates.commandOverrides[commandName]` from effective config
4. `responseTemplates.defaultTemplateId` (default `default`)

## Output shape

`ModuleCommandResult.responseTemplate`:

- `requestedTemplateId`, `appliedTemplateId`, `enforcementMode`, `warnings[]` (each line ≤ 120 chars)
- `telemetry`: `resolveNs`, `warningCount`

When a template applies, `data.presentation` may list `matchedSections` for expected keys.

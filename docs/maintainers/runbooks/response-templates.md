# Response templates — maintainer runbook

## Purpose

Phase **6b** adds optional **response template** metadata to `workspace-kit run` JSON output so agents and humans can rely on consistent presentation hints without modules returning different shapes.

## Defaults

- `responseTemplates.enforcementMode`: `advisory` (warnings only)
- `responseTemplates.defaultTemplateId`: `default`
- Builtin ids: `default`, `compact`, `completed_task`, `COMPLETED_TASK`

## Config

Set in `.workspace-kit/config.json` (see `responseTemplates.*` keys in `docs/maintainers/CONFIG.md` after `config generate-docs`).

Example:

```json
"responseTemplates": {
  "enforcementMode": "advisory",
  "defaultTemplateId": "compact",
  "commandOverrides": {
    "generate-recommendations": "completed_task"
  }
}
```

## CLI args

- `responseTemplateId`: explicit template
- `responseTemplateDirective` / `instructionTemplateDirective` / `instruction`: plain-English, e.g. `"Use the COMPLETED_TASK template"`

## Strict mode

Use `enforcementMode: strict` only when you want unknown template ids (explicit or override) to fail the command with `response-template-invalid`.

## Versioning

Template **definitions** are versioned in code (`ResponseTemplateDefinition.version`). When changing expected sections, bump the version and document compatibility in release notes.

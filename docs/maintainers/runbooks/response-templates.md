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

Use `enforcementMode: strict` when governance or CI should fail closed on template mistakes:

| Condition | `advisory` | `strict` |
| --- | --- | --- |
| Resolved template id unknown (explicit, `commandOverrides`, or `defaultTemplateId`) | Warning in `responseTemplate.warnings`; command `ok` unchanged | Command ends with `ok: false`, `code: response-template-invalid` |
| `responseTemplateId` disagrees with plain-English directive (`instruction` / `responseTemplateDirective` / …) | Warning; explicit id wins | Command ends with `ok: false`, `code: response-template-conflict` |

Default remains **`advisory`** for local iteration; use **strict** on automation that should block merges when agents mix template id and prose.

## Versioning

Template **definitions** are versioned in code (`ResponseTemplateDefinition.version`). When changing expected sections, bump the version and document compatibility in release notes.

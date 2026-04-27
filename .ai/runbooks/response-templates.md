# Response templates — maintainer runbook

## Purpose

Phase **6b** adds optional **response template** metadata to `workspace-kit run` JSON output so agents and humans can rely on consistent presentation hints without modules returning different shapes.

**Canonical precedence + strict-mode semantics:** [`docs/maintainers/response-template-contract.md`](../response-template-contract.md) (keep in sync with `src/core/response-template-shaping.ts`). **Agent map:** [`AGENT-CLI-MAP.md`](../AGENT-CLI-MAP.md) → **Response templates on `workspace-kit run`**.

## Resolution precedence (summary)

| Step | Source |
| --- | --- |
| 1 | JSON **`responseTemplateId`** |
| 2 | **`responseTemplateDirective`**, then **`instructionTemplateDirective`**, then **`instruction`** (first parse win) |
| 3 | **`responseTemplates.commandOverrides[commandName]`** |
| 4 | Contextual **`phase_ship`** — **`run-transition`** with **`action`:** **`complete`**; **`set-current-phase`** or compatibility **`update-workspace-phase-snapshot`** without **`dryRun`:** **`true`**; **`generate-document`** for **`ROADMAP.md`** / **`FEATURE-TAXONOMY.md`** without **`options.dryRun`:** **`true`** |
| 5 | Builtin **`defaultResponseTemplateId`** for the command (manifest), when present |
| 6 | **`responseTemplates.defaultTemplateId`** |
| 7 | Fallback id **`default`** |

## Defaults

- `responseTemplates.enforcementMode`: `advisory` (warnings only)
- `responseTemplates.defaultTemplateId`: `default`
- Builtin ids: `default`, `compact`, `completed_task`, `COMPLETED_TASK`, `phase_ship` (contextual; see step 4)

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
| Resolved template id unknown (any precedence step) | Warning in `responseTemplate.warnings`; command `ok` unchanged | Command ends with `ok: false`, `code: response-template-invalid`; message states **which step** chose the bad id |
| `responseTemplateId` disagrees with plain-English directive (`instruction` / `responseTemplateDirective` / …) | Warning; explicit id wins | Command ends with `ok: false`, `code: response-template-conflict`; message names the **directive field** and parsed id |

Default remains **`advisory`** for local iteration; use **strict** on automation that should block merges when agents mix template id and prose.

## Versioning

Template **definitions** are versioned in code (`ResponseTemplateDefinition.version`). When changing expected sections, bump the version and document compatibility in release notes.

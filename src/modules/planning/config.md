# Planning Module Config

Planning owns all former Ideas `workspace-kit run` commands (28 total). The deprecated module id `ideas` in `modules.enabled` / `modules.disabled` still aliases to `planning`; `workspace-kit doctor` warns when that alias is in effect — update config to use `planning` instead.

- `planning.defaultQuestionDepth`: interview depth mode (`minimal` | `guided` | `adaptive`; default `adaptive`)
- `planning.hardBlockCriticalUnknowns`: when `true`, `build-plan` finalize fails until critical unknowns are answered
- `planning.adaptiveFinalizePolicy`: adaptive follow-up finalize handling (`off` | `warn` | `block`; default `off`)
- `planning.rulePacks`: optional per-workflow question overrides (`baseQuestions`, `adaptiveQuestions`)

## Unified IdeaPlan dashboard (default on)

The unified IdeaPlan dashboard path (Brainstorm button, brainstorming rollup, six-state plan cards) is **on by default** after Phase 149. No env var is required for normal operation.

**Emergency rollback / legacy UI kill-switch** (restores Plan-only dashboard affordances without redeploying):

| Surface | Disable unified UI |
| --- | --- |
| Env | `IDEAS_UNIFIED_MODEL_ENABLED=0` (or `false`, `off`, `no`) |
| VS Code | `workflowCannon.ideas.unifiedModelEnabled`: `false` |

Precedence matches the server and extension flag modules: explicit VS Code setting → env → default **on**. See `.ai/runbooks/unified-model-rollback.md` for WBS-6 data migration rollback (separate from this UI kill-switch).

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

## Git canonical sync — ideas domain

Planning owns idea CRUD commands after the ideas→planning cutover, but the **git sync domain id** for workflow ideas remains **`ideas`** (see `ALL_PLANNING_SYNC_DOMAINS` in `planning-canonical-sync-domains.ts`). Configure it with `planning.canonicalSync.domains`; the `phase_journal` alias does not expand to `ideas`.

### Event kinds (stable)

Idea mutations publish **`planning.idea.created`** and **`planning.idea.updated`** only. Do not rename these kinds — remote event segments, golden fixtures, and replay appliers depend on the prefix `planning.idea.`.

### Event draft `command.moduleId` policy (freeze)

Published git-event-log envelopes for idea commands (`create-idea`, `update-idea`, `delete-idea`, `reorder-ideas`) **must keep** `command.moduleId: "ideas"` even though handlers live under the planning module. Rationale:

- Existing canonical segments and golden fixtures record `moduleId: "ideas"`.
- Hydrate/replay matches on event kind + payload, but operators and tooling filter on `command.moduleId` for provenance.
- Rewriting to `planning` would fork replay compatibility without a versioned migration.

New drafts set `moduleId: "ideas"` via `ideaDraftCtx()` in `idea-row/idea-crud-commands.ts`. **Prefer freeze** — do not change draft `moduleId` or backfill historical events unless a dedicated migration task ships a new envelope schema version.

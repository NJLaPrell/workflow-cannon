<!-- GENERATED FROM .ai/runbooks/build-plan-consumer-inventory.md — edit that file; do not hand-edit this render (see docs/maintainers/adrs/ADR-ai-canonical-maintainer-docs-pipeline.md) -->

# build-plan consumer inventory (T100839)

**Status:** Audit artifact — documents all in-repo `build-plan` consumers before interview sunset (`INTERVIEW_SUNSET.md`, phase 144+).  
**Method:** `rg 'build-plan'` / `rg 'buildPlan|planning-build-session|planningSession'` across `src/`, `extensions/`, `test/`, `.ai/`, `schemas/`, `scripts/` (excludes `.workspace-kit/migration-backups/` and generated `dist/` except where cited as build output of `src/`).  
**Primary migration target:** **planner-chat** + **PlanArtifact v1** — see [`.ai/playbooks/planner-chat.md`](../playbooks/planner-chat.md) and [`.ai/runbooks/plan-artifact-workflow.md`](./plan-artifact-workflow.md).

## Executive summary

| Surface | Consumer count (approx.) | Sunset posture |
| --- | --- | --- |
| CLI handler + helpers | 1 command + 4 support modules | Remove handler; retain `import-build-plan` provenance until PlanArtifact-only |
| Dashboard extension | Wizard UI, session panel, chat prefill, resume parser | Replace with Ideas **Plan this** → `start-idea-planning` / `buildPlannerChatPrompt` |
| Session persistence | SQLite `planning-build-session` + legacy sidecar import | Remove module state row; no PlanArtifact equivalent needed |
| Agent canon / docs | Runbooks, CLI map, snippets, CAE activations | Redirect to plan-artifact + planner-chat runbooks |
| Tests | ~40 subtests across 8 files | Delete or rewrite to PlanArtifact / planner-chat contracts |
| MCP | **None** | N/A |
| `build-plan-for-idea` bridge | **Absent** | Use existing `start-idea-planning` + planner-chat instead |

## Migration ladder (replacement)

```text
Legacy                          →  Primary replacement
─────────────────────────────────────────────────────────────────────────
build-plan interview            →  planner-chat (chat) + start-idea-planning (dashboard)
build-plan finalize → tasks     →  draft-plan-artifact → review → accept → finalize-plan-to-phase
build-plan executionTaskDrafts  →  append-wbs-row / patch-plan-artifact → finalize-plan-to-phase
import-build-plan provenance    →  idea-originated PlanArtifact (provenance.source from Ideas row)
planningSession dashboard slice →  PlanArtifact panel + idea planning session (update-idea-planning-session)
buildPlanningInterviewPrompt    →  buildPlannerChatPrompt + .ai/playbooks/planner-chat.md
```

## `build-plan-for-idea` bridge

**Absent.** Repository grep finds no command, instruction stub, or handler named `build-plan-for-idea`. Idea-scoped planning is implemented separately:

| Path | Role |
| --- | --- |
| `src/modules/ideas/start-idea-planning-handler.ts` | `start-idea-planning` — advances Ideas row + unified IdeaPlan document into planning |
| `src/modules/ideas/planner-flow-status.ts` | Recommends `start-idea-planning` / `planner-chat` in status envelopes |
| `extensions/cursor-workflow-cannon/src/planner-chat-prompt.ts` | `buildPlannerChatPrompt` — dashboard **Plan this** chat prefill |

Do **not** add a `build-plan-for-idea` shim; extend planner-chat / PlanArtifact if idea bridging gaps remain.

---

## 1. CLI command — planning module

| Path | Role | Migration target |
| --- | --- | --- |
| `src/modules/planning/index.ts` | **`build-plan` command handler** — interview loop, finalize branches (`response` / `tasks` / `executionTaskDrafts`), activity recording, session clear on complete/discard | Remove handler; operators use `start-idea-planning` + `draft-plan-artifact` / `finalize-plan-to-phase` |
| `src/contracts/builtin-run-command-manifest.json` | Registers `build-plan` in builtin manifest (`moduleId: planning`, instruction `build-plan.md`) | Remove manifest row after handler removal |
| `src/modules/planning/instructions/build-plan.md` | Agent instruction capsule — argv examples, response codes, session persistence note, `recommendedNextCommands` → `draft-plan-artifact` | Archive or replace with deprecation pointer to `plan-artifact-workflow.md` |
| `src/modules/planning/README.md` | Module overview references legacy interview | Update to PlanArtifact-only narrative |
| `src/modules/planning/config.md` | Config knobs consumed by question engine | Retain only if shared with PlanArtifact review; else remove with interview |

### Supporting implementation (handler internals)

| Path | Role | Migration target |
| --- | --- | --- |
| `src/modules/planning/build-plan-output-helpers.ts` | Response envelope helpers; **`buildPlanArtifactRecommendedNextCommands`** emits `draft-plan-artifact` + `importSource: import-build-plan` | Keep provenance helper on PlanArtifact import path only; drop interview-specific helpers |
| `src/modules/planning/build-plan-execution-drafts.ts` | Multi-task draft builder for `executionTaskDrafts` finalize preview | `append-wbs-row` + `finalize-plan-to-phase` on accepted PlanArtifact |
| `src/modules/planning/build-plan-session-persist.ts` | Persists/clears `planning-build-session` module state via planning sync | Delete with session sunset |
| `src/core/planning/build-plan-session-file.ts` | Session snapshot types, SQLite read, legacy `.workspace-kit/planning/build-plan-session.json` import | Delete; dashboard reads PlanArtifact / idea planning session instead |
| `src/core/planning/index.ts` | Re-exports session file helpers | Trim exports after session removal |
| `src/core/planning/plan-artifact-v1.ts` | **`import-build-plan`** in `PlanArtifactProvenanceSource` union (aligns with `PLANNING_WORKFLOW_TYPES`) | **Retain** — narrow compatibility bridge into PlanArtifact |
| `src/core/planning/validate-plan-artifact.ts` | Treats `import-build-plan` / `import-wishlist` as non-idea-originated drafts | **Retain** — validation for import bridge |
| `src/modules/planning/instructions/draft-plan-artifact.md` | Documents `importSource: import-build-plan` | **Retain** — document import-only provenance |

### Related CLI (not `build-plan`, but coupled)

| Path | Role | Migration target |
| --- | --- | --- |
| `src/modules/task-engine/instructions/persist-planning-execution-drafts.md` | Documents flow starting from `build-plan` multi-task preview | Rewrite examples to start from `finalize-plan-to-phase` |
| `src/modules/planning/index.ts` (`draft-plan-artifact`) | Accepts `importSource: import-build-plan` | **Retain** as import bridge until sunset complete |

---

## 2. Session persistence

| Path | Role | Migration target |
| --- | --- | --- |
| `src/modules/planning/build-plan-session-persist.ts` | Write path: `workspace_module_state` row `module_id = planning-build-session` | Remove |
| `src/core/planning/build-plan-session-file.ts` | Read path + `toDashboardPlanningSession` projection | Remove |
| `src/core/state/kit-sqlite/planning-sqlite-kernel.ts` | Loads `planning-build-session` state JSON | Remove read branch |
| `src/modules/task-engine/persistence/kit-persistence-map-runtime.ts` | Maps legacy sidecar `.workspace-kit/planning/build-plan-session.json` → SQLite | Remove sidecar mapping after migration window |
| `src/modules/task-engine/task-state-events/module-state-planning-sync-allowlist.ts` | Allowlists `planning-build-session` for canonical sync | Remove allowlist entry |
| `src/modules/task-engine/task-state-events/fixtures/golden-planning-module-state-*.json` | Golden events for session create/remove with `resumeCli` containing `build-plan` | Replace with PlanArtifact / idea-session fixtures |

**Dashboard exposure of session:**

| Path | Role | Migration target |
| --- | --- | --- |
| `src/modules/task-engine/dashboard/build-dashboard-base.ts` | `planningSession` span — reads build-plan session for `dashboard-summary` | Remove slice (`STATE_TASKS.md` T-STATE-008) |
| `src/modules/task-engine/dashboard/focused-slice-builders.ts` | Includes `planningSession` in focused projections unless `overview` skips it | Remove; use PlanArtifact / Ideas planning status |
| `src/modules/task-engine/dashboard/dashboard-summary-projection.ts` | Projects `planningSession` field | Remove field from contract |
| `src/modules/task-engine/dashboard/dashboard-agent-status.ts` | `activePlanningLabel` + `command: build-plan` in agent status | Remove; surface `planner-chat` / `start-idea-planning` activity instead |
| `src/modules/task-engine/instructions/dashboard-summary.md` | Documents `planningSession` payload + `overview` skip of build-plan read | Update contract doc |
| `src/contracts/dashboard-summary-run.ts` | Type includes `planningSession: unknown` | Remove from typed contract |

---

## 3. Dashboard extension (`extensions/cursor-workflow-cannon`)

| Path | Role | Migration target |
| --- | --- | --- |
| `extensions/cursor-workflow-cannon/src/views/dashboard/DashboardViewProvider.ts` | **Planning wizard host** — `client.run("build-plan", …)`, activity record/clear, completion notice steering to PlanArtifact | Remove wizard; wire **Plan this** only through `start-idea-planning` |
| `extensions/cursor-workflow-cannon/src/views/dashboard/render-dashboard.ts` | `PlanningInterviewWizardPanel`, `renderPlanningInterviewWizardPanel`, `renderPlanningSession`, `humanizePlanningToken` | Remove UI; render PlanArtifact / Ideas planning panels |
| `extensions/cursor-workflow-cannon/src/views/dashboard/dashboard-webview-client.ts` | Webview actions: `planning-wizard-start/submit/cancel/dismiss`, `planning-new-plan` → `prefillPlanningInterviewChat` | Remove actions; keep Ideas plan/brainstorm actions |
| `extensions/cursor-workflow-cannon/src/parse-build-plan-resume-cli.ts` | Parses `resumeCli` from session snapshot for resume chat | Remove with session sunset |
| `extensions/cursor-workflow-cannon/README.md` | Notes dashboard Planning session when build-plan file exists | Update to PlanArtifact / Ideas |

---

## 4. Playbook chat prompts

| Path | Role | Migration target |
| --- | --- | --- |
| `extensions/cursor-workflow-cannon/src/playbook-chat-prompts.ts` | **`buildPlanningInterviewPrompt`** — Start Interview → `list-planning-types` + `build-plan` loop | **`buildPlannerChatPrompt`** + `.ai/playbooks/planner-chat.md` |
| `extensions/cursor-workflow-cannon/src/playbook-chat-prompts.ts` | **`buildPlanningInterviewResumePrompt`** — embeds saved `resumeCli` | **`update-idea-planning-session`** resume surfaces / planner-chat packet |
| `extensions/cursor-workflow-cannon/src/views/dashboard/DashboardViewProvider.ts` | Handles `prefillPlanningInterviewChat` / resume prefill messages | Route to `buildPlannerChatPrompt` via existing Plan-this handlers |

---

## 5. MCP references

**None found.** Grep of Workflow Cannon MCP tool descriptors under the project MCP folder returns no `build-plan` or `planning-workflow` string matches. Planner MCP tests (`test/mcp-planner-packet*.mjs`) reference **`planner-chat`** only — already aligned with migration target.

---

## 6. Tests

| Path | Role | Migration target |
| --- | --- | --- |
| `test/planning-module.test.mjs` | Primary **`build-plan` contract suite** (~20 tests): session persist/clear, output modes, executionTaskDrafts, createWishlist rejection, scoring | Delete or port critical assertions to PlanArtifact + `start-idea-planning` tests |
| `test/task-engine.test.mjs` | Session persist import, `build-plan` live activity + discard | Remove build-plan activity tests |
| `test/cae-evaluate.test.mjs` | CAE bundle activation for `build-plan` + `draft-plan-artifact` | Remove `build-plan` cases; keep PlanArtifact lens tests |
| `test/module-command-router.test.mjs` | Asserts `build-plan` in routed command list | Remove from expected set after handler deletion |
| `test/cli.test.mjs` | CLI help output includes `build-plan` | Update assertion after command removal |
| `test/plan-artifact-draft-validation.test.mjs` | `import-build-plan` not treated as idea-originated | **Retain** |
| `test/dashboard-task-state-projection-summary.test.mjs` | `planningSession: null` default | Update when field removed |
| `extensions/cursor-workflow-cannon/test/playbook-chat-prompts.test.mjs` | Asserts `buildPlanningInterviewPrompt` references `build-plan` | Replace with planner-chat prompt tests |
| `extensions/cursor-workflow-cannon/test/parse-build-plan-resume-cli.test.mjs` | Resume CLI parser | Delete with parser |
| `extensions/cursor-workflow-cannon/test/command-client.test.mjs` | Activity record/clear for `build-plan` | Delete or retarget |
| `extensions/cursor-workflow-cannon/test/render-dashboard.test.mjs` | `renderPlanningInterviewWizardPanel` + fixture copy mentioning build-plan wizard | Remove wizard render tests |

---

## 7. Agent canon, runbooks, and operator docs

| Path | Role | Migration target |
| --- | --- | --- |
| `.ai/runbooks/planning-workflow.md` | **Legacy runbook** — entire `build-plan` quickstart ladder | Deprecate; pointer to `plan-artifact-workflow.md` + `planner-chat` |
| `.ai/runbooks/plan-artifact-workflow.md` | Cross-links `build-plan` + `import-build-plan` bridge | Trim legacy references after sunset |
| `.ai/runbooks/HUB.md` | Routes "Legacy planning interview" → `planning-workflow.md` | Replace row with this inventory + plan-artifact hub |
| `.ai/runbooks/agent-task-engine-ergonomics.md` | Points operators at `build-plan` finalize | Rewrite to PlanArtifact ladder |
| `.ai/runbooks/cursor-long-session.md` | Mentions in-flight `build-plan` snapshot in dashboard | Update to Ideas / PlanArtifact |
| `.ai/AGENT-CLI-MAP.extended.md` | Copy-paste `build-plan` argv examples | Remove block; keep PlanArtifact section |
| `.ai/agent-cli-snippets/by-command/build-plan.json` | Permissive args schema + instruction path | Remove snippet entry |
| `.ai/agent-cli-snippets/INDEX.json` | Indexes `build-plan` snippet | Remove index row |
| `.ai/CLI-VISUAL-GUIDE.md` | Module diagram lists `build-plan` | Update diagram |
| `INTERVIEW_SUNSET.md` | Master removal plan (references this inventory task) | Implementation tracker — not a consumer |
| `STATE_TASKS.md` | T-STATE-008 remove `planningSession` polling | Execution task for dashboard slice removal |

---

## 8. CAE (advisory planning lenses)

| Path | Role | Migration target |
| --- | --- | --- |
| `.ai/cae/registry/activations.v1.json` | Multiple activations with `commandName: build-plan` (think bundles, planning-build-plan-core) | Retarget to `draft-plan-artifact`, `review-plan-artifact`, `planner-chat` / `start-idea-planning` |
| `.ai/cae/planning-lenses/README.md` | Lists `build-plan` as activation scope | Update scope list |
| `.ai/cae/planning-lenses/architecture.md` | References reuse of `build-plan` paths | Update to PlanArtifact paths |
| `.ai/cae/planning-lenses/risk.md` | Mentions dual UX (`build-plan` + PlanArtifact) | Update after dual UX removed |
| `.ai/cae/planning-lenses/anti-patterns.md` | Warns against removing `build-plan` without A-COMPAT | Satisfied by this inventory + sunset ADR |
| `src/core/cae/planning-session-scope.ts` | CAE `planningSession` scope hook (distinct from dashboard `planningSession` slice) | Retain for PlanArtifact commands |

---

## 9. Schemas and fixtures

| Path | Role | Migration target |
| --- | --- | --- |
| `schemas/planning/plan-artifact.v1.schema.json` | `provenance.source` enum includes `import-build-plan` | **Retain** until import bridge removed |
| `schemas/planning-generation-cli-prelude.json` | Notes handler-only gates for conditional mutators (e.g. `build-plan persistTasks`) | Remove `build-plan` mention |
| `fixtures/planning/plan-artifact-full-feature.rendered.md` | Compatibility note: `planningSession` for interview resume | Update rendered fixture copy |

---

## 10. Scripts and layer policy

| Path | Role | Migration target |
| --- | --- | --- |
| `scripts/core-module-layer-allowlist.json` | Allowlists `build-plan-session-file.ts` in core/planning layer | Remove entry with file deletion |
| `scripts/_oneoff-ideas-planner-wishlist-tasks.mjs` | Historical one-off referencing `build-plan` outputMode | Archive only — not runtime |
| `scripts/generate-planner-phase110-batch.mjs` | Generated batch tasks mentioning build-plan inventory | Historical code-gen input |

---

## 11. Import bridge (`import-build-plan`) — not a consumer, but coupling point

`build-plan` does not call PlanArtifact directly at finalize; it **recommends** import:

```text
build-plan (outputMode: tasks) → data.recommendedNextCommands[]
  → draft-plan-artifact { importSource: "import-build-plan", persist: false }
```

| Path | Role | Migration target |
| --- | --- | --- |
| `src/modules/planning/build-plan-output-helpers.ts` | Emits recommendation | Remove with handler; operators draft PlanArtifact from planner-chat without import |
| `src/modules/planning/index.ts` | `draft-plan-artifact` accepts `importSource: import-build-plan` | Keep until no callers remain, then drop enum value |

---

## Verification commands (re-run audit)

```bash
# Core consumers (expect matches until sunset lands)
rg -l 'build-plan' src extensions test .ai schemas scripts

# Session / dashboard slice
rg 'planning-build-session|planningSession' src extensions test

# Idea bridge (should NOT match build-plan-for-idea)
rg 'build-plan-for-idea' .

# MCP (should be empty)
rg 'build-plan' .cursor/projects/*/mcps/project-0-workflow-cannon-workflow-cannon
```

---

## Related tasks and decisions

- **T100839** (this audit) — consumer inventory for sunset planning.
- **`INTERVIEW_SUNSET.md`** — product decision and phased removal tasks (T-SUNSET-*).
- **`STATE_TASKS.md` T-STATE-008** — remove `planningSession` dashboard polling.
- **Phase 116+ primary flow:** `create-idea` → dashboard **Plan this** → `start-idea-planning` → planner-chat → PlanArtifact draft/review/accept/finalize.

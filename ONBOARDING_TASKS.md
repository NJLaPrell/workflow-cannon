# Workflow Cannon Onboarding Implementation Tasks

This task list breaks `ONBOARDING_PLAN.md` into implementation-ready work.

The target product shape is one primary setup entrypoint with multiple wizard cards:

```bash
pnpm exec wk setup
```

Dashboard equivalent:

```text
Setup Workflow Cannon
```

The setup experience should stay warm and lightly tavern-themed, but all repository writes, task-store mutations, policy approvals, and repair actions must remain technically explicit.

## Current Repo Anchors

Implementation should build on existing repo surfaces instead of duplicating them.

| Existing surface | Relevant files / areas | Notes |
| --- | --- | --- |
| Top-level CLI dispatch | `src/cli.ts` | Existing commands include `init`, `start`, `doctor`, `refresh-context`, `run`, `config`, `upgrade`, `detach`, and `drift-check`. Add `setup` here. |
| Init attach / repair primitive | `src/cli/init-command.ts`, `src/cli/init-plan.ts`, `src/cli/init-writer.ts`, `src/cli/init-detection.ts`, `src/cli/init-sqlite.ts` | Already handles dry-run, JSON, non-interactive approval, runtime contract, SQLite initialization, starter task, doctor validation, force repair, and idempotent starter task behavior. |
| Start status primitive | `src/cli/start-command.ts` | Already checks attached state and doctor health and returns useful next commands. |
| Refresh context primitive | `src/cli/refresh-context-command.ts` | Already regenerates profile-driven context artifacts. |
| Module command system | `src/cli/run-command.ts`, `src/core/module-command-router.ts`, `src/modules/index.ts` | Setup-specific read/write operations should likely be module-backed where they belong in normal `wk run` discovery. |
| Agent behavior | `src/modules/agent-behavior/`, `.ai/playbooks/workspace-kit-chat-onboarding.md`, `.ai/playbooks/workspace-kit-chat-behavior-interview.md` | Reuse guidance/profile commands and the tavern tone. |
| Planning / first work | `src/modules/planning/`, `.ai/runbooks/planning-workflow.md` | Reuse planning interview and wishlist creation for new feature ideas. |
| Task engine | `src/modules/task-engine/` | Reuse `create-task`, wishlist, phase notes, and task conversion primitives where possible. |
| Dashboard extension | `extensions/cursor-workflow-cannon/src/extension.ts`, `extensions/cursor-workflow-cannon/src/views/dashboard/`, `extensions/cursor-workflow-cannon/src/playbook-chat-prompts.ts` | Add setup dashboard/card entrypoint and chat prefill helpers here. |
| CLI tests | `test/cli.test.mjs` | Existing test helpers cover temp workspaces, runtime contract fixtures, init/start/doctor behavior, starter task idempotency, and non-interactive approval. Extend here. |

## Phase 1 — Define Setup Data Model and Status Semantics

### T001 — Define setup status schema

**Goal:** Establish a stable JSON model for setup dashboard state.

**Implementation details:**

- Add a setup status type under a new setup module or CLI support area, likely one of:
  - `src/modules/setup/`
  - `src/cli/setup-status.ts`
- Recommended shape:

```ts
type SetupAreaId =
  | "core"
  | "collaboration"
  | "projectIntelligence"
  | "firstQuests"
  | "advanced";

type SetupSeverity = "complete" | "warning" | "error" | "optional" | "inProgress";

type SetupAreaStatus = {
  id: SetupAreaId;
  label: string;
  required: boolean;
  severity: SetupSeverity;
  completionPercent: number;
  summary: string;
  items: SetupChecklistItem[];
  recommendedAction?: SetupRecommendedAction;
};
```

**Acceptance criteria:**

- Setup status can represent all five wizard cards.
- Optional advanced settings do not make overall setup look broken.
- Status supports green/check, yellow/warning, red/error, gray/optional, and in-progress/resumable states.

### T002 — Define setup completion scoring

**Goal:** Separate required readiness from recommended and optional setup depth.

**Implementation details:**

- Implement aggregate fields:
  - `coreReadinessPercent`
  - `recommendedSetupPercent`
  - `optionalDepthPercent`
- Core Setup should be the only blocking area.
- Collaboration Style, Project Intelligence, and First Quests should be recommended.
- Advanced Controls should be optional.

**Acceptance criteria:**

- A fully attached repo with skipped Advanced Controls can still show healthy core setup.
- Output can show something like:

```text
Core readiness: 100%
Recommended setup: 70%
Optional depth: 20%
```

### T003 — Define setup actions and dry-run behavior

**Goal:** Make all wizard actions explicit and previewable.

**Implementation details:**

- Define action ids such as:
  - `core.previewAttach`
  - `core.attach`
  - `core.previewRepair`
  - `core.repair`
  - `collaboration.setPreset`
  - `collaboration.keepCurrent`
  - `project.scan`
  - `project.refreshContext`
  - `firstQuests.createDocumentationTasks`
  - `firstQuests.convertTaskList`
  - `firstQuests.analyzeWeaknesses`
  - `firstQuests.startFeatureIdea`
- Each mutating action should have a dry-run or preview path where possible.

**Acceptance criteria:**

- Mutating actions clearly declare whether they write files, write task-store rows, write config, or only produce recommendations.
- Reset/destructive actions are not default actions.

## Phase 2 — Add Top-Level `wk setup`

### T004 — Add `setup` to top-level CLI help

**Goal:** Make `wk setup` the obvious first-class entrypoint.

**Implementation details:**

- Update `src/cli.ts` help text near the existing “Start here” section.
- Suggested help language:

```text
setup          Guided Workflow Cannon setup dashboard / wizard
setup --json   Machine-readable setup status
setup --dry-run Preview setup/repair recommendations without writing
```

**Acceptance criteria:**

- `workspace-kit --help` shows `setup` before or near `init`.
- Help makes clear that `init` remains a lower-level primitive.

### T005 — Add top-level CLI dispatch for `setup`

**Goal:** Route `workspace-kit setup` through a new setup command implementation.

**Implementation details:**

- Add `src/cli/setup-command.ts`.
- In `src/cli.ts`, import and dispatch:

```ts
if (command === "setup") {
  return runWorkspaceKitSetupCommand(...);
}
```

- Support initial flags:
  - `--json`
  - `--dry-run`
  - `--area <core|collaboration|project|first-quests|advanced>`
  - `--action <actionId>` for non-interactive follow-up actions, if needed

**Acceptance criteria:**

- `wk setup` returns a human-friendly setup overview.
- `wk setup --json` returns a single JSON envelope.
- Unknown flags fail with usage error.

### T006 — Implement non-mutating setup overview

**Goal:** Make the first version of `wk setup` read-only.

**Implementation details:**

- Reuse existing detection and validation logic:
  - `detectInitProjectContext`
  - `buildInitPlan`
  - `collectDoctorContractIssues`
  - existing runtime/manifest checks from `start-command.ts`
- Do not call `applyInitPlan` in the overview path.
- Show all setup cards and recommended actions.

**Acceptance criteria:**

- Running `wk setup` in an unattached repo does not write files.
- Running `wk setup` in an attached repo does not change settings or task state.
- Output clearly recommends preview/attach/repair where needed.

### T007 — Implement `wk setup --json`

**Goal:** Provide a stable machine-readable setup status for dashboard and agents.

**Implementation details:**

- JSON envelope:

```json
{
  "ok": true,
  "code": "setup-status",
  "schemaVersion": 1,
  "data": {
    "areas": [],
    "coreReadinessPercent": 0,
    "recommendedSetupPercent": 0,
    "optionalDepthPercent": 0,
    "recommendedNextAction": {}
  }
}
```

**Acceptance criteria:**

- Dashboard can consume this without parsing text.
- Attached, unattached, partial, and broken workspaces all produce useful statuses.

### T008 — Implement attach/repair action plumbing

**Goal:** Let setup drive existing init behavior without duplicating it.

**Implementation details:**

- For Core Setup attach/repair, call the existing init command logic or shared helper functions.
- Preserve approval behavior from `init-command.ts`:
  - interactive confirmation
  - `--yes --approval-rationale`
  - `WORKSPACE_KIT_POLICY_APPROVAL`
- For repair, prefer existing `init --force` semantics.

**Acceptance criteria:**

- `wk setup --action core.attach` behaves consistently with `wk init`.
- `wk setup --action core.repair` behaves consistently with `wk init --force`.
- No user files are deleted.
- Changed kit-owned files are backed up before replacement.

## Phase 3 — Core Setup Wizard

### T009 — Implement Core Setup checklist detection

**Goal:** Accurately report required setup health.

**Checklist items:**

- package available
- workspace attached
- manifest present
- owned paths policy present
- runtime stamp present and healthy
- runtime launcher present and executable
- task DB initialized
- doctor passes
- starter task preference known

**Implementation details:**

- Reuse runtime and doctor contract validation from existing CLI code.
- Reuse SQLite readiness from existing init/doctor utilities.
- Reuse starter task detection from `init-command.ts`, but consider extracting it so setup can read it without private duplication.

**Acceptance criteria:**

- Fresh repo shows Core Setup as red/error with attach recommendation.
- Partial attach shows Core Setup as red/error or yellow/warning with repair recommendation.
- Healthy attach shows Core Setup complete.

### T010 — Make init starter-task behavior fit First Quests

**Goal:** Avoid generic starter task confusion once First Quests exists.

**Implementation details:**

- Keep existing starter task behavior for backwards compatibility.
- In setup flow, default to `--no-starter-task` unless the user chooses a First Quest or explicit starter task option.
- Consider marking setup-created first tasks with metadata such as:

```json
{
  "createdBy": "workflow-cannon-setup",
  "setupQuest": "project-docs"
}
```

**Acceptance criteria:**

- Rerunning setup never duplicates starter or first-quest tasks.
- Existing `metadata.starterTask === true` behavior remains compatible.

### T011 — Add Core Setup tests

**Goal:** Extend `test/cli.test.mjs` to cover setup core states.

**Test cases:**

- `wk setup --json` in empty repo reports unattached Core Setup.
- `wk setup` in empty repo writes nothing.
- `wk setup --json` after init reports Core Setup complete.
- partial attach reports repair recommendation.
- `wk setup --action core.attach` respects non-interactive approval rules.
- rerunning setup does not duplicate starter tasks.

**Acceptance criteria:**

- Tests pass through `pnpm run test`.

## Phase 4 — Collaboration Style Wizard

### T012 — Model collaboration presets

**Goal:** Create a small user-facing preset layer over existing guidance/profile mechanics.

**Recommended presets:**

| Preset | Maps to |
| --- | --- |
| Wary Scout | cautious behavior profile, lower autonomy / more check-ins |
| Steady Adventurer | balanced behavior profile, default guidance |
| Battle Tactician | calculated behavior profile, tradeoff/evidence leaning |
| Bold Experimenter | experimental behavior profile, safe exploration leaning |

**Implementation details:**

- Add mapping in `src/modules/agent-behavior/` or setup module.
- Reuse existing commands where possible:
  - `resolve-agent-guidance`
  - `set-agent-guidance`
  - `resolve-behavior-profile`
  - `set-active-behavior-profile`
  - `sync-effective-behavior-cursor-rule`

**Acceptance criteria:**

- Setup can display current collaboration preset or custom profile state.
- User can keep current setting on rerun.
- Preset save updates both guidance and behavior profile where appropriate.

### T013 — Add setup action to set collaboration preset

**Goal:** Let the setup wizard persist a collaboration preset.

**Implementation details:**

- Add setup action:

```text
collaboration.setPreset
```

- Args:

```json
{"presetId":"steady-adventurer"}
```

- Under the hood, call existing agent behavior module functions or run commands.
- If `tasks.planningGenerationPolicy` requires tokens for related writes, follow existing playbook rules.

**Acceptance criteria:**

- Setting a preset persists the expected profile/guidance.
- Setup status updates after setting it.
- Player-facing output does not expose `builtin:` ids unless advanced detail is requested.

### T014 — Keep `/onboarding` as a shortcut into Collaboration Style

**Goal:** Preserve current chat onboarding while aligning it with the new setup model.

**Implementation details:**

- Update `.ai/playbooks/workspace-kit-chat-onboarding.md` to refer to Collaboration Style as the setup card.
- Keep tavern tone.
- Do not remove `/onboarding`.

**Acceptance criteria:**

- Existing chat entrypoint still works.
- Docs explain that `/onboarding` is a shortcut, not a separate required setup lane.

### T015 — Keep `/behavior-interview` as Advanced Collaboration Style

**Goal:** Move the long interview into Advanced rather than first-run required setup.

**Implementation details:**

- Update references so it appears as:
  - Collaboration Style → Advanced → Scribe’s Quiz
  - Advanced Controls → Custom behavior profile
- Preserve existing `interview-behavior-profile` flow.

**Acceptance criteria:**

- Long interview remains available.
- First-run setup does not force the long interview.

## Phase 5 — Project Intelligence Wizard

### T016 — Implement project intelligence status

**Goal:** Report whether Workflow Cannon has current project understanding.

**Implementation details:**

- Detect existence and freshness of:
  - `.workspace-kit/generated/project-context.json`
  - `.cursor/rules/workspace-kit-project-context.mdc`
- Compare against `workspace-kit.profile.json` modified time if practical.
- Detect common project signals:
  - `README.md`
  - package files
  - test scripts
  - docs directories
  - TODO/task files
  - architecture docs

**Acceptance criteria:**

- Setup status can say whether project context is missing, stale, or current.
- Project Intelligence can recommend `refresh-context` or repo scan.

### T017 — Add read-only project scan command

**Goal:** Give setup a safe way to inspect project structure.

**Implementation details:**

- Add a module command, likely:

```bash
wk run project-intelligence-scan '{}'
```

- Or add under setup:

```bash
wk run setup-project-scan '{}'
```

- Output should include:
  - detected package manager
  - docs health summary
  - test/lint/typecheck command presence
  - task-list sources found
  - likely weaknesses
  - recommended First Quest

**Acceptance criteria:**

- Command is read-only.
- Output is structured JSON.
- Does not require policy approval.

### T018 — Add project context refresh action

**Goal:** Wire Project Intelligence to existing `refresh-context` behavior.

**Implementation details:**

- Setup can offer:

```text
project.refreshContext
```

- Under the hood, call `runRefreshContextCommand` or equivalent shared logic.
- Keep existing env approval behavior if required.

**Acceptance criteria:**

- User can refresh generated context from setup.
- Preview/status clearly says which generated files will update.

### T019 — Add Project Intelligence tests

**Goal:** Cover read-only scanning and context freshness.

**Test cases:**

- missing generated context reports warning.
- after `refresh-context`, Project Intelligence improves.
- scan detects README/package/test scripts in fixture repo.
- scan finds TODO/task-list file candidates.

**Acceptance criteria:**

- Tests cover both text and JSON paths where relevant.

## Phase 6 — First Quests Wizard

### T020 — Define First Quest types and metadata

**Goal:** Standardize setup-created task/wishlist metadata.

**Quest types:**

- `project-docs`
- `convert-task-list`
- `analyze-next-steps`
- `find-weaknesses`
- `new-feature-idea`
- `skip`

**Metadata:**

```json
{
  "createdBy": "workflow-cannon-setup",
  "setupQuest": "project-docs",
  "setupRunId": "..."
}
```

**Acceptance criteria:**

- Rerun can detect already-created quest items.
- Setup can avoid duplicates.

### T021 — Implement Set Up Project Documentation quest

**Goal:** Create useful documentation setup tasks.

**Implementation details:**

- Use Project Intelligence scan results to decide candidates.
- Create proposed or ready task-engine tasks such as:
  - create/update README
  - add architecture overview
  - add agent guidance docs
  - add contribution/setup docs
  - document test/build commands
- Use existing `create-task` or batch task creation primitives.

**Acceptance criteria:**

- User sees preview before tasks are created.
- Created tasks include acceptance criteria and metadata.
- Rerun does not duplicate tasks.

### T022 — Implement Convert Existing Task List quest

**Goal:** Convert existing task source into task-engine tasks.

**Implementation details:**

- First version can support pasted text or a file path.
- Later versions can support GitHub issues or detected TODO files.
- Parse markdown checkboxes, numbered lists, headings, and simple TODO lines.
- Create task drafts for preview before persistence.

**Acceptance criteria:**

- User can preview generated tasks.
- User can persist selected tasks.
- Each created task records source location or pasted-source reference in metadata.

### T023 — Implement Analyze Project and Recommend Next Steps quest

**Goal:** Convert a read-only project scan into proposed tasks.

**Implementation details:**

- Use Project Intelligence scan output.
- Generate recommended tasks for missing docs, missing tests, weak scripts, missing architecture, unclear package setup, or task backlog absence.
- Prefer `status: proposed` unless user explicitly asks to create ready tasks.

**Acceptance criteria:**

- Recommendations are evidence-backed.
- User can accept all, accept selected, or skip.

### T024 — Implement Find Weaknesses quest

**Goal:** Provide a deeper risk/quality scan option.

**Implementation details:**

- Start with non-invasive heuristics:
  - missing tests
  - missing CI docs
  - absent architecture docs
  - package scripts missing check/test/build
  - stale generated context
  - no issue/task ingestion source
- Avoid pretending to do deep security analysis unless implemented.

**Acceptance criteria:**

- Output distinguishes heuristic findings from verified problems.
- Persisted tasks include risk notes and evidence.

### T025 — Implement Start New Feature Idea quest

**Goal:** Make planning interview accessible from setup.

**Implementation details:**

- Reuse planning module flow:
  - `list-planning-types`
  - `build-plan`
  - `createWishlist:true`
- Dashboard can prefill chat using existing `buildPlanningInterviewPrompt`.
- CLI can present next command or begin interactive mode later.

**Acceptance criteria:**

- User can choose new feature idea from First Quests.
- Result is a wishlist item or planning artifact, not an ambiguous chat-only plan.

### T026 — Add First Quest tests

**Goal:** Cover idempotency and task creation safety.

**Test cases:**

- preview creates no tasks.
- project-docs quest creates expected task metadata.
- rerun does not duplicate setup quest tasks.
- task-list conversion preview parses markdown.
- selected task persistence works.

**Acceptance criteria:**

- Tests pass under `pnpm run test`.

## Phase 7 — Advanced Controls Wizard

### T027 — Implement Advanced Controls status

**Goal:** Show optional advanced settings without making setup look broken.

**Possible detected controls:**

- policy approval docs/lanes understood
- planning generation policy
- dashboard/status behavior
- documentation generation settings
- experimental capabilities
- custom behavior profile

**Implementation details:**

- Use existing config resolution commands where possible:
  - `resolve-config`
  - `explain-config`
  - behavior profile commands
- Do not invent new config unless necessary.

**Acceptance criteria:**

- Advanced Controls can show Optional when untouched.
- Missing advanced settings do not lower Core readiness.

### T028 — Link behavior interview into Advanced Controls

**Goal:** Make the long personality interview discoverable but not required.

**Implementation details:**

- Dashboard action can prefill `/behavior-interview` or direct chat prompt.
- CLI setup can say:

```text
Advanced: run /behavior-interview for the Scribe’s Quiz.
```

**Acceptance criteria:**

- User has one obvious path to advanced personalization.

### T029 — Add advanced config explainers

**Goal:** Let users inspect advanced settings safely.

**Implementation details:**

- Use read-only config explain output where possible.
- Add setup text that explains these are optional.

**Acceptance criteria:**

- No advanced mutation is performed by default.
- Mutating advanced settings require explicit action and appropriate approval lane.

## Phase 8 — Dashboard Setup Experience

### T030 — Add dashboard Setup card / view

**Goal:** Surface the new setup model visually in the Cursor extension.

**Implementation details:**

- Add a setup section to `extensions/cursor-workflow-cannon/src/views/dashboard/`.
- Likely update:
  - `DashboardViewProvider.ts`
  - `render-dashboard.ts`
  - any dashboard CSS/helpers
- Consume `wk setup --json` or a `wk run setup-status '{}'` command.

**Acceptance criteria:**

- Dashboard shows the five wizard cards.
- Each card displays icon/status/summary/recommended action.

### T031 — Add dashboard command: Open Setup

**Goal:** Provide a clear entrypoint from the command palette and dashboard.

**Implementation details:**

- Add extension command:

```text
workflowCannon.openSetup
```

- Add package contribution if needed in `extensions/cursor-workflow-cannon/package.json`.
- If no workspace is attached, the command should still explain next CLI command rather than failing with a dead end.

**Acceptance criteria:**

- User can open Setup from dashboard/command palette.
- Unattached workspace gets useful attach guidance.

### T032 — Add dashboard setup actions

**Goal:** Let users drive safe setup actions from UI.

**Initial actions:**

- preview attach
- attach
- preview repair
- repair
- keep current collaboration style
- set collaboration preset
- scan project
- refresh context
- launch first quest chat/action
- open advanced controls

**Acceptance criteria:**

- Mutating actions show confirmation.
- Policy-gated actions make approval explicit.
- Dashboard refreshes after actions.

### T033 — Add setup chat prefill helpers

**Goal:** Reuse chat for workflows that are better agent-led.

**Implementation details:**

- Extend `extensions/cursor-workflow-cannon/src/playbook-chat-prompts.ts`.
- Add helpers such as:
  - `buildSetupOverviewPrompt`
  - `buildProjectDocsQuestPrompt`
  - `buildConvertTaskListQuestPrompt`
  - `buildProjectWeaknessScanPrompt`
- Reuse existing `prefillCursorChat` pattern.

**Acceptance criteria:**

- First Quest options can open focused Cursor chats.
- Prompt text instructs agents to use kit commands and not hand-edit stores.

### T034 — Dashboard UI tests / compile checks

**Goal:** Prevent extension regressions.

**Implementation details:**

- Update existing extension tests or add tests around prompt builders/render helpers.
- Run:

```bash
pnpm run ui:prepare
pnpm run ext:compile
```

**Acceptance criteria:**

- Extension compiles.
- Prompt builder tests cover new setup prompts.

## Phase 9 — Documentation and Playbook Alignment

### T035 — Update README first-run path

**Goal:** Make `wk setup` the primary public onboarding path.

**Implementation details:**

- Update root `README.md` Quick Start:
  - primary: `pnpm exec wk setup`
  - lower-level: `wk init`, `wk doctor`, `wk start` advanced/manual
- Preserve package naming clarity.

**Acceptance criteria:**

- New users see setup first, not a scattered command chain.

### T036 — Update AGENTS and agent source docs

**Goal:** Teach agents the new setup surface.

**Implementation details:**

- Update:
  - `AGENTS.md`
  - `.ai/AGENT-CLI-MAP.md`
  - `.ai/WORKSPACE-KIT-SESSION.md`
  - `.ai/MACHINE-PLAYBOOKS.md`
- Keep source-of-truth order intact.

**Acceptance criteria:**

- Agents know `setup` is the main user-facing entrypoint.
- Agents still use lower-level commands for precise operations when needed.

### T037 — Update onboarding playbooks

**Goal:** Align existing tavern onboarding with the new wizard model.

**Implementation details:**

- Update:
  - `.ai/playbooks/workspace-kit-chat-onboarding.md`
  - `.ai/playbooks/workspace-kit-chat-behavior-interview.md`
  - `.ai/runbooks/agent-guidance-onboarding.md`
- Clarify that `/onboarding` is a Collaboration Style shortcut.

**Acceptance criteria:**

- No contradiction between setup dashboard and existing chat onboarding.

### T038 — Add maintainer docs mirror

**Goal:** Keep human maintainer docs aligned.

**Implementation details:**

- Add or update docs under:
  - `docs/maintainers/`
  - `docs/maintainers/runbooks/`
  - `docs/maintainers/playbooks/`
- Use documentation generation flow if source docs drive rendered copies.

**Acceptance criteria:**

- Maintainer docs explain setup groups and implementation boundaries.

### T039 — Update changelog / roadmap / decisions

**Goal:** Record product direction and implementation phases.

**Implementation details:**

- Update appropriate maintainer docs:
  - `docs/maintainers/ROADMAP.md`
  - `docs/maintainers/CHANGELOG.md`
  - `docs/maintainers/DECISIONS.md` if a decision record is warranted

**Acceptance criteria:**

- Product direction is not only in root planning docs.

## Phase 10 — Policy, Safety, and Idempotency

### T040 — Enforce no-destructive-rerun defaults

**Goal:** Make setup safe to rerun.

**Rules:**

- Existing healthy values default to Keep.
- Existing behavior profile defaults to Keep.
- Existing task DB is never recreated by setup.
- Existing first-quest tasks are not duplicated.
- Changed kit-owned files require preview/backup/confirmation before replacement.
- Reset actions are advanced-only and explicitly confirmed.

**Acceptance criteria:**

- Tests cover idempotent rerun behavior.
- No setup action silently resets user configuration.

### T041 — Add setup run identity

**Goal:** Track setup-created artifacts for dedupe and traceability.

**Implementation details:**

- Generate `setupRunId` for mutating setup sessions.
- Store setup-created task metadata.
- Consider a lightweight setup state file only if necessary, e.g. `.workspace-kit/setup-state.json`.
- Prefer deriving state from existing artifacts when possible.

**Acceptance criteria:**

- Setup can identify prior setup-created work.
- Rerun avoids duplicate first quests.

### T042 — Align setup approval lanes

**Goal:** Keep setup consistent with existing policy model.

**Implementation details:**

- Top-level attach/repair/config actions use env/flag approval lane.
- Sensitive `wk run` task mutations use JSON `policyApproval` in the command args.
- Chat text or dashboard clicks do not replace policy approval.

**Acceptance criteria:**

- Setup output clearly distinguishes approval lanes.
- Policy trace is written for approved top-level mutators where existing commands already do so.

## Phase 11 — Release and Validation

### T043 — Add setup command to command discovery if applicable

**Goal:** Make setup discoverable.

**Implementation details:**

- Top-level CLI help must list setup.
- If module-backed setup commands are added, ensure `wk run` command catalog includes read-only/mutating setup operations with policy hints.

**Acceptance criteria:**

- `workspace-kit --help` and dashboard both point to setup.

### T044 — Add compatibility / migration notes

**Goal:** Make the change safe for existing users.

**Implementation details:**

- `wk init` remains supported.
- `/onboarding` remains supported.
- `/behavior-interview` remains supported.
- Existing task stores and profiles remain valid.

**Acceptance criteria:**

- No breaking change is introduced without migration notes.

### T045 — Run validation gates

**Goal:** Validate implementation before merge.

**Commands:**

```bash
pnpm run build
pnpm run check
pnpm run test
pnpm run ui:prepare
pnpm run parity
```

**Acceptance criteria:**

- All relevant checks pass.
- Any skipped check has explicit rationale and follow-up task.

## Suggested Implementation Order

1. T001–T003: setup status model and actions.
2. T004–T008: top-level `wk setup` read-only status and attach/repair plumbing.
3. T009–T011: Core Setup detection and tests.
4. T012–T015: Collaboration Style preset layer and docs alignment.
5. T016–T019: Project Intelligence read-only scan and context refresh.
6. T020–T026: First Quests previews and task/wishlist creation.
7. T027–T029: Advanced Controls status and links.
8. T030–T034: dashboard setup UI and chat prompt helpers.
9. T035–T039: documentation alignment.
10. T040–T045: safety, idempotency, compatibility, validation.

## Suggested Initial Task Engine Backlog

If converting this plan into task-engine rows, start with these task slices:

1. `T###` — Add read-only `wk setup --json` status model for Core Setup.
2. `T###` — Add human `wk setup` overview and CLI help entry.
3. `T###` — Add Core Setup attach/repair action plumbing through existing init command.
4. `T###` — Add Collaboration Style preset model and setup status.
5. `T###` — Add Project Intelligence scan command.
6. `T###` — Add First Quests metadata and project-docs quest preview.
7. `T###` — Add dashboard setup cards consuming setup JSON.
8. `T###` — Align README, AGENTS, playbooks, and maintainer docs.
9. `T###` — Add idempotency/policy regression tests for setup reruns.

## Non-Goals for First Implementation

- Do not replace `wk init`; wrap it.
- Do not remove `/onboarding` or `/behavior-interview`; reposition them.
- Do not build every advanced setting editor in the first pass.
- Do not do deep security analysis under Project Intelligence unless explicitly implemented.
- Do not create tasks without preview or clear user action.
- Do not make optional advanced settings lower Core readiness.

# Interview Sunset Plan

**Artifact:** `INTERVIEW_SUNSET.md`  
**Status:** Proposed implementation plan  
**Decision:** Hard-sunset the legacy `build-plan` planning interview path and make PlanArtifact v1 the only supported serious planning lifecycle.

## 1. Purpose

Workflow Cannon is now far enough along in the PlanArtifact direction that the legacy planning interview path should be removed instead of gradually deprecated.

This plan breaks the removal into focused, agent-sized implementation tasks. Each task is intended to be small enough for one agent session, with clear ownership, dependencies, technical steps, acceptance criteria, and verification commands.

## 2. Product decision

The old planning interview path is no longer part of the desired product model.

Keep:

```text
PlanArtifact lifecycle
planner-chat / natural brainstorm path
CAE planning lenses
review-plan-artifact
accept-plan-artifact
finalize-plan-to-phase
persist-planning-execution-drafts
review-planning-execution-drafts
Dashboard PlanArtifact panel/actions
```

Remove or quarantine:

```text
build-plan
fixed planning workflow types
question-engine interview logic
build-plan session snapshots
planningSession dashboard surface
wizard/resume interview UI
legacy planning runbook path
direct task creation from build-plan
wishlist creation from build-plan, unless intentionally retained for quick idea intake
```

## 3. Source-of-truth after sunset

```text
Chat / planner-chat      = discovery and natural brainstorming
CAE                     = advisory planning lenses
PlanArtifact v1         = durable design intent, approved scope, WBS source
review-plan-artifact    = deterministic plan quality check
accept-plan-artifact    = explicit human acceptance gate
finalize-plan-to-phase  = WBS-to-task materialization boundary
Task Engine             = execution truth
Dashboard               = human operating surface
Markdown/docs           = projections, not runtime state
```

## 4. Non-goals

- Do not remove PlanArtifact storage, schemas, fixtures, rendering, review, acceptance, or finalize behavior.
- Do not remove `persist-planning-execution-drafts` or `review-planning-execution-drafts`; PlanArtifact finalization should continue to reuse the task-engine persistence stack.
- Do not treat CAE shadow output as a replacement for deterministic PlanArtifact review.
- Do not move task execution state into the planning module.
- Do not preserve `build-plan` compatibility unless a specific task intentionally keeps a narrow bridge.

## 5. Implementation tasks

## T-SUNSET-001 — Write removal ADR and scope boundary

**Goal:** Establish the decision: `build-plan` interview is removed, PlanArtifact is the only planning lifecycle.

**Blocked by:** None.

**Blocks:** All implementation tasks.

**Owned paths:**

```text
.ai/adrs/
src/modules/planning/README.md
PLANNER_ARCHITECTURE.md
INTERVIEW_SUNSET.md
```

**Technical implementation steps:**

1. Add an ADR, for example `.ai/adrs/ADR-remove-build-plan-interview.md`.
2. State that `build-plan`, fixed planning types, interview snapshots, and dashboard `planningSession` are removed.
3. State what remains:
   - `draft-plan-artifact`
   - `review-plan-artifact`
   - `accept-plan-artifact`
   - `finalize-plan-to-phase`
   - `review-planning-execution-drafts`
   - `persist-planning-execution-drafts`
   - PlanArtifact dashboard controls
   - CAE planning lenses
4. Update `src/modules/planning/README.md` so the current scope no longer lists `build-plan` as active.
5. Update `PLANNER_ARCHITECTURE.md` compatibility section to mark the v1 compatibility bridge as superseded by this solo-operator removal decision.
6. Link this `INTERVIEW_SUNSET.md` from the ADR so implementation agents have the task breakdown.

**Acceptance criteria:**

```text
ADR exists and clearly records the hard-removal decision.
README says PlanArtifact is the only supported serious planning path.
No doc still recommends build-plan as a normal workflow.
The ADR explicitly says Task Engine remains the execution source of truth.
```

**Verification:**

```bash
grep -R "build-plan" .ai src/modules/planning PLANNER_ARCHITECTURE.md
pnpm run check-planning-consistency
```

---

## T-SUNSET-002 — Inventory all legacy planning interview references

**Goal:** Produce a complete removal map before touching implementation.

**Blocked by:** T-SUNSET-001.

**Blocks:** T-SUNSET-003, T-SUNSET-004, T-SUNSET-005, T-SUNSET-006, T-SUNSET-007.

**Owned paths:**

```text
artifacts/legacy-build-plan-removal-inventory.md
```

**Technical implementation steps:**

1. Search for:
   - `build-plan`
   - `planningSession`
   - `build-plan-session`
   - `PLANNING_WORKFLOW_TYPES`
   - `question-engine`
   - `list-planning-types`
   - `explain-planning-rules`
   - `composePlanningWishlistArtifact`
   - `executionTaskDrafts`
2. Categorize each hit:
   - command routing
   - schema/snippet/manifest
   - dashboard contract
   - dashboard rendering
   - tests
   - runbooks/docs
   - CAE activations
   - storage/sync
3. Mark each item:
   - delete
   - keep
   - replace with PlanArtifact
   - investigate
4. Do not edit code in this task except adding the inventory artifact.

**Acceptance criteria:**

```text
Inventory lists every file that references the legacy interview path.
Each reference has an action: delete, keep, replace, or investigate.
PlanArtifact-related references are not incorrectly marked for deletion.
```

**Verification:**

```bash
grep -R "build-plan\|planningSession\|PLANNING_WORKFLOW_TYPES\|question-engine" . \
  --exclude-dir=node_modules \
  --exclude-dir=dist
```

---

## T-SUNSET-003 — Remove `build-plan` command routing from planning module

**Goal:** Remove the legacy interview command path from `src/modules/planning/index.ts`.

**Blocked by:** T-SUNSET-002.

**Blocks:** T-SUNSET-004, T-SUNSET-009.

**Owned paths:**

```text
src/modules/planning/index.ts
src/modules/planning/types.ts
src/modules/planning/question-engine.ts
src/modules/planning/artifact.ts
src/modules/planning/build-plan-output-helpers.ts
src/modules/planning/build-plan-execution-drafts.ts
src/modules/planning/build-plan-session-persist.ts
```

**Technical implementation steps:**

1. Remove command branches for:
   - `build-plan`
   - `list-planning-types`
   - `explain-planning-rules`
2. Remove imports only used by those commands:
   - `PLANNING_WORKFLOW_DESCRIPTORS`
   - `PLANNING_WORKFLOW_TYPES`
   - `nextPlanningQuestions`
   - `resolvePlanningConfig`
   - `resolvePlanningRulePack`
   - `composePlanningWishlistArtifact`
   - `buildTasksFromExecutionDrafts`
   - `persistInterviewSnapshot`
   - `clearBuildPlanSessionWithPlanningSync`
3. Keep PlanArtifact command branches intact:
   - `draft-plan-artifact`
   - `review-plan-artifact`
   - `accept-plan-artifact`
   - `finalize-plan-to-phase`
4. Prefer minimal deletion in this task. Remove routing first, then let build/test output identify dead files for T-SUNSET-004.

**Acceptance criteria:**

```text
planningModule.onCommand supports PlanArtifact lifecycle commands only.
Calling build-plan returns unsupported-command.
No PlanArtifact command behavior regresses.
TypeScript build identifies no unused imports in index.ts.
```

**Verification:**

```bash
pnpm run build
pnpm exec wk run build-plan '{}'
pnpm exec wk run draft-plan-artifact --schema-only '{}'
```

---

## T-SUNSET-004 — Delete dead legacy interview implementation files

**Goal:** Remove implementation files that only supported the legacy guided interview.

**Blocked by:** T-SUNSET-003.

**Blocks:** T-SUNSET-009.

**Owned paths:**

```text
src/modules/planning/question-engine.ts
src/modules/planning/types.ts
src/modules/planning/artifact.ts
src/modules/planning/build-plan-output-helpers.ts
src/modules/planning/build-plan-execution-drafts.ts
src/modules/planning/build-plan-session-persist.ts
src/core/planning/build-plan-session-file.ts
```

**Technical implementation steps:**

1. Confirm each candidate file is unused after T-SUNSET-003.
2. Delete files that are exclusively legacy interview support.
3. If a file contains shared code, extract the shared PlanArtifact-safe piece first.
4. Remove exports from any barrel files.
5. Remove references from package files, docs, generated manifests, or tests.

**Acceptance criteria:**

```text
No deleted file is imported by the build.
No PlanArtifact storage, validation, review, render, accept, or finalize code is removed.
No build-plan session helper remains unless still required by a non-legacy system.
```

**Verification:**

```bash
pnpm run build
grep -R "build-plan-session\|question-engine\|composePlanningWishlistArtifact" src test .ai schemas
```

---

## T-SUNSET-005 — Remove legacy command manifest, snippets, and instruction docs

**Goal:** Remove agent-discoverable command surfaces for the deleted interview commands.

**Blocked by:** T-SUNSET-003.

**Blocks:** T-SUNSET-010.

**Owned paths:**

```text
src/modules/planning/instructions/
src/contracts/builtin-run-command-manifest.json
.ai/agent-cli-snippets/
.ai/AGENT-CLI-MAP.md
.ai/AGENT-CLI-MAP.extended.md
scripts/check-builtin-command-manifest.mjs
```

**Technical implementation steps:**

1. Delete instruction docs for:
   - `build-plan`
   - `list-planning-types`
   - `explain-planning-rules`
2. Regenerate built-in command manifest if generated.
3. Remove generated CLI snippets for the deleted commands.
4. Update command indexes so agents discover only PlanArtifact planning commands.
5. Ensure `.ai/AGENT-CLI-MAP.md` points planning work to `.ai/runbooks/plan-artifact-workflow.md`.

**Acceptance criteria:**

```text
Agents cannot discover build-plan as a supported command.
No command snippet exists for build-plan/list-planning-types/explain-planning-rules.
PlanArtifact command snippets still exist.
Command manifest check passes.
```

**Verification:**

```bash
pnpm run build
node scripts/generate-agent-cli-snippets.mjs
node scripts/check-builtin-command-manifest.mjs
grep -R '"build-plan"\|"list-planning-types"\|"explain-planning-rules"' .ai src/contracts src/modules/planning
```

---

## T-SUNSET-006 — Remove `planningSession` from dashboard summary contract and builder

**Goal:** Make dashboard state PlanArtifact-first by removing the legacy interview session field.

**Blocked by:** T-SUNSET-002.

**Blocks:** T-SUNSET-007, T-SUNSET-009.

**Owned paths:**

```text
src/contracts/dashboard-summary-run.ts
src/modules/task-engine/commands/task-engine-dashboard-on-command.ts
src/modules/task-engine/dashboard/
```

**Technical implementation steps:**

1. Remove `planningSession` from `DashboardSummaryData`.
2. Remove code that reads or redacts the build-plan session for dashboard summary.
3. Preserve `planArtifact`.
4. Ensure dashboard projections still include PlanArtifact summary when available.
5. If snapshot schema version must change, bump it deliberately and update tests.

**Acceptance criteria:**

```text
dashboard-summary data no longer includes planningSession.
dashboard-summary still includes planArtifact.
No dashboard summary builder reads build-plan session state.
PlanArtifact summary shape remains bounded and does not load full WBS unnecessarily.
```

**Verification:**

```bash
pnpm run build
pnpm exec wk run dashboard-summary '{"projection":"overview"}'
grep -R "planningSession" src/contracts src/modules/task-engine
```

---

## T-SUNSET-007 — Remove dashboard wizard/resume UI for legacy planning

**Goal:** Remove the visible planning interview UI from the Cursor dashboard.

**Blocked by:** T-SUNSET-006.

**Blocks:** T-SUNSET-009.

**Owned paths:**

```text
extensions/cursor-workflow-cannon/src/views/dashboard/render-dashboard.ts
extensions/cursor-workflow-cannon/src/views/dashboard/DashboardViewProvider.ts
extensions/cursor-workflow-cannon/src/views/dashboard/dashboard-webview-client.ts
extensions/cursor-workflow-cannon/test/render-dashboard.test.mjs
```

**Technical implementation steps:**

1. Remove UI render paths for legacy planning wizard/resume chips.
2. Remove webview actions that start/resume/discard `build-plan`.
3. Preserve PlanArtifact dashboard actions:
   - Review
   - Accept
   - Finalize dry-run
   - Finalize persist
4. Preserve planner-chat / Ideas flow only if it creates or resumes PlanArtifact work.
5. Remove any empty UI containers left by the wizard removal.

**Acceptance criteria:**

```text
Dashboard has no build-plan wizard or resume controls.
Dashboard still renders PlanArtifact current/recent summary.
Dashboard PlanArtifact Review/Accept/Finalize actions still work.
No webview client action posts build-plan commands.
```

**Verification:**

```bash
pnpm run ext:compile
node --test extensions/cursor-workflow-cannon/test/render-dashboard.test.mjs
grep -R "build-plan\|planningSession" extensions/cursor-workflow-cannon/src extensions/cursor-workflow-cannon/test
```

---

## T-SUNSET-008 — Clean up planning sync/module-state for build-plan session

**Goal:** Remove sync/state handling for legacy `planningSession`.

**Blocked by:** T-SUNSET-006.

**Blocks:** T-SUNSET-009.

**Owned paths:**

```text
src/core/planning/
src/modules/task-engine/
src/core/state/
test/
```

**Technical implementation steps:**

1. Identify module-state IDs for build-plan session, likely around `planning-build-session`.
2. Remove publish/hydrate handling if it exists only for build-plan session.
3. Keep planning sync domains needed by:
   - ideas
   - phase notes
   - workspace status
   - PlanArtifact indexes, if applicable
4. Add a no-op cleanup migration only if stale rows would break startup.
5. Do not delete user data blindly; stale build-plan session rows can be ignored or pruned by a cleanup command/test helper.

**Acceptance criteria:**

```text
No runtime path reads build-plan session module-state.
Planning sync still works for non-interview domains.
Stale legacy module-state rows do not break dashboard-summary or doctor.
```

**Verification:**

```bash
pnpm run build
pnpm run test
grep -R "planning-build-session\|build-plan-session" src test
```

---

## T-SUNSET-009 — Rewrite tests around PlanArtifact-only planning

**Goal:** Replace legacy interview tests with PlanArtifact-only behavior tests.

**Blocked by:** T-SUNSET-003, T-SUNSET-004, T-SUNSET-006, T-SUNSET-007, T-SUNSET-008.

**Blocks:** T-SUNSET-010, T-SUNSET-011.

**Owned paths:**

```text
test/
extensions/cursor-workflow-cannon/test/
fixtures/planning/
```

**Technical implementation steps:**

1. Delete or rewrite tests that assert successful `build-plan` behavior.
2. Add tests that assert:
   - `build-plan` returns unsupported command.
   - `list-planning-types` returns unsupported command.
   - `explain-planning-rules` returns unsupported command.
   - `dashboard-summary` has no `planningSession`.
   - PlanArtifact command golden path still passes.
   - PlanArtifact finalize still delegates through task-engine draft review/persist path.
3. Keep PlanArtifact fixture validation tests.
4. Keep dashboard PlanArtifact action tests.
5. Rename old test descriptions so there is no product confusion.

**Acceptance criteria:**

```text
Test suite passes without any build-plan success-path assertions.
There are explicit regression tests proving build-plan is not supported.
PlanArtifact E2E/golden-path tests still pass.
Dashboard tests assert PlanArtifact-first behavior.
```

**Verification:**

```bash
pnpm run test
pnpm run test:plan-artifact-fixtures
node --test test/plan-artifact-e2e-cli.test.mjs
node --test extensions/cursor-workflow-cannon/test/render-dashboard.test.mjs
```

---

## T-SUNSET-010 — Update all runbooks, CAE references, and agent guidance

**Goal:** Ensure agents never choose the removed planning interview path.

**Blocked by:** T-SUNSET-005, T-SUNSET-009.

**Blocks:** T-SUNSET-011.

**Owned paths:**

```text
.ai/runbooks/
.ai/playbooks/
.ai/cae/
.ai/AGENT-CLI-MAP.md
.ai/AGENT-CLI-MAP.extended.md
docs/maintainers/runbooks/
docs/maintainers/playbooks/
```

**Technical implementation steps:**

1. Delete or archive `.ai/runbooks/planning-workflow.md` if it is legacy-only.
2. Update `.ai/runbooks/plan-artifact-workflow.md` to remove outdated compatibility language.
3. Update CAE activations so planning guidance points to:
   - planner-chat
   - draft-plan-artifact
   - review-plan-artifact
   - accept-plan-artifact
   - finalize-plan-to-phase
4. Remove CAE guidance that suggests `build-plan`.
5. Update maintainer mirrors if the project requires generated docs parity.

**Acceptance criteria:**

```text
No agent-facing doc recommends build-plan.
PlanArtifact workflow is the only planning workflow in runbooks.
CAE planning lenses remain active for PlanArtifact commands.
Docs mirrors are in sync or intentionally marked generated.
```

**Verification:**

```bash
grep -R "build-plan\|planning interview\|planningSession" .ai docs src/modules/planning
pnpm run check-planning-consistency
pnpm run check
```

---

## T-SUNSET-011 — Add workspace cleanup / migration helper

**Goal:** Remove stale legacy session artifacts from local workspaces safely.

**Blocked by:** T-SUNSET-009, T-SUNSET-010.

**Blocks:** T-SUNSET-012.

**Owned paths:**

```text
scripts/
src/modules/planning/instructions/
test/
```

**Technical implementation steps:**

1. Add a small script or command, for example:

```bash
node scripts/prune-legacy-build-plan-state.mjs
```

2. Script should:
   - delete `.workspace-kit/planning/build-plan-session.json` if present.
   - optionally remove known module-state rows for build-plan session.
   - not touch PlanArtifact files.
   - print what it removed.
   - support dry-run.
3. Add test coverage with a temp workspace.
4. Document the cleanup in the ADR or release note.

**Acceptance criteria:**

```text
Dry-run shows stale build-plan artifacts without deleting them.
Persist mode deletes only legacy build-plan session artifacts.
PlanArtifact files and indexes are untouched.
Cleanup is safe to run multiple times.
```

**Verification:**

```bash
node scripts/prune-legacy-build-plan-state.mjs --dry-run
node scripts/prune-legacy-build-plan-state.mjs
pnpm run test
```

---

## T-SUNSET-012 — Final closeout, changelog, and release evidence

**Goal:** Prove the hard sunset is complete and safe.

**Blocked by:** T-SUNSET-011.

**Blocks:** None.

**Owned paths:**

```text
CHANGELOG.md
docs/maintainers/CHANGELOG.md
artifacts/
```

**Technical implementation steps:**

1. Add changelog entry:
   - removed legacy `build-plan` guided interview
   - removed dashboard `planningSession`
   - PlanArtifact is now the only planning lifecycle
2. Add release evidence artifact:

```text
artifacts/legacy-build-plan-removal-closeout.md
```

3. Include:
   - commands run
   - grep results
   - deleted surfaces
   - kept surfaces
   - known follow-ups
4. Run full gates.

**Acceptance criteria:**

```text
Changelog clearly records breaking internal planning cleanup.
Closeout evidence lists all commands run and results.
No build-plan command path remains.
No planningSession dashboard field remains.
PlanArtifact lifecycle remains green.
```

**Verification:**

```bash
pnpm run build
pnpm run test
pnpm run check
pnpm run ext:compile
pnpm run test:plan-artifact-fixtures
grep -R "build-plan\|planningSession" src extensions .ai docs test \
  --exclude-dir=node_modules \
  --exclude-dir=dist
```

## 6. Dependency map

```text
T-SUNSET-001
  ↓
T-SUNSET-002
  ├─→ T-SUNSET-003
  │     └─→ T-SUNSET-004
  │     └─→ T-SUNSET-005
  ├─→ T-SUNSET-006
  │     ├─→ T-SUNSET-007
  │     └─→ T-SUNSET-008
  ↓
T-SUNSET-009
  ↓
T-SUNSET-010
  ↓
T-SUNSET-011
  ↓
T-SUNSET-012
```

## 7. Parallelization plan

After T-SUNSET-002, these can run in parallel:

```text
T-SUNSET-003 — command routing removal
T-SUNSET-006 — dashboard contract removal
```

After T-SUNSET-003, these can run in parallel:

```text
T-SUNSET-004 — dead implementation deletion
T-SUNSET-005 — command manifest/snippet cleanup
```

After T-SUNSET-006, these can run in parallel:

```text
T-SUNSET-007 — dashboard UI removal
T-SUNSET-008 — sync/module-state cleanup
```

## 8. Sizing guidance

This plan intentionally uses several small tasks instead of a few large cleanup tasks.

```text
12 tasks total
8 implementation tasks
2 documentation/guidance tasks
1 cleanup/migration task
1 closeout task
```

The risky surfaces are command routing, dashboard contract, and tests. Keeping those separate prevents one agent from ripping through too many surfaces and breaking PlanArtifact accidentally.

## 9. Preferred final state

```text
No build-plan command.
No fixed planning interview question engine.
No planningSession dashboard field.
No dashboard wizard/resume UI.
No agent-facing docs recommending build-plan.
PlanArtifact lifecycle is the only serious planning path.
Task Engine remains the only execution-task source of truth.
```

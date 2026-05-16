# Workflow Cannon Init UX Implementation Plan

Status: historical program backlog. Canonical behavior for first-run init now lives in `.ai/adrs/ADR-workspace-kit-init-first-run-v1.md`, and execution state lives in the SQLite task engine. Keep this file as the original INIT_PLAN task map for traceability; do not treat it as a newer source of truth when it conflicts with the ADR, `.ai/` runbooks, or task records.

Overall Goal:
Make Workflow Cannon attach to an existing project with one intuitive command:

cd my-project
pnpm add -D @workflow-cannon/workspace-kit
pnpm exec wk init
pnpm exec wk start

When the plan is fully implemented, a brand-new repo with no Workflow Cannon files can run wk init and end in a ready state:

* workspace-kit.profile.json exists and contains detected project values.
* Required schema, manifest, owned-paths, config, generated context, and editor rule files exist.
* SQLite task persistence exists and passes doctor checks.
* wk doctor passes.
* wk start gives a useful status page.
* wk run get-next-actions ‘{}’ works.
* wk run dashboard-summary ‘{}’ works.
* Re-running wk init is safe and idempotent.
* wk init –dry-run writes nothing.
* Existing user files are not silently overwritten.
* Existing generated kit-owned files are backed up before overwrite.
* The old profile-context regeneration behavior still exists under wk refresh-context.

Definition of Done for the Whole Plan:
The implementation is complete only when all of the following are true:

1. The README happy path says to run wk init before wk doctor.
2. wk init works from an empty temp repo.
3. wk init works from a normal package repo with package.json.
4. wk init detects package manager, project name, commands, and default branch where possible.
5. wk init creates the expected Workflow Cannon baseline files.
6. wk init initializes SQLite through existing core database preparation code.
7. wk init runs doctor validation after setup and reports success/failure clearly.
8. wk start works before and after initialization.
9. wk refresh-context replaces the old init behavior.
10. wk doctor in an unattached repo tells the user to run wk init, not wk upgrade.
11. dry-run, JSON output, non-interactive approval, backup, repair, and idempotency paths are tested.
12. Full repo gates pass: build, check, test, parity, and pre-merge gates.

============================================================
T001 - Define first-run init contract and update product direction docs

Goal:
Create the implementation contract before changing behavior, so agents do not accidentally blur init, upgrade, doctor, and refresh-context semantics.

Technical details:

* Add a short ADR under the repo’s existing ADR location.
* Define the new meaning of wk init:
    * Attaches Workflow Cannon to an existing repository.
    * Works from a repo with no Workflow Cannon files.
    * Detects project metadata.
    * Generates baseline files.
    * Initializes SQLite persistence.
    * Optionally creates a starter task.
    * Runs doctor validation after setup.
* Define that current init behavior becomes:
    wk refresh-context
* Define refresh-context:
    * Requires an existing valid workspace-kit.profile.json.
    * Regenerates .workspace-kit/generated/project-context.json.
    * Regenerates .cursor/rules/workspace-kit-project-context.mdc.
* Define upgrade:
    * Refreshes kit-owned baseline files after package upgrades.
    * Is not the recommended first-run command.
* Define doctor:
    * Remains read-only.
    * Validates setup only.
    * Directs unattached repos to wk init.
* Define approval behavior:
    * Interactive TTY confirmation is valid for local wk init.
    * Non-interactive setup requires either:
        –yes –approval-rationale “…”
        or WORKSPACE_KIT_POLICY_APPROVAL.
    * Existing env approval behavior remains supported.
* Define file safety:
    * Never overwrite workspace-kit.profile.json by default.
    * Never overwrite unknown user-owned files.
    * Back up existing changed kit-owned files before overwrite.
    * init –dry-run must never write.
* Define starter task behavior:
    * Optional.
    * Default yes unless –no-starter-task.
    * Idempotent.
    * Created through existing task-engine APIs, not raw DB writes.

Acceptance criteria:

* ADR exists.
* ADR clearly defines init, refresh-context, upgrade, and doctor responsibilities.
* ADR includes approval model.
* ADR includes file ownership and backup rules.
* ADR includes whole-plan success criteria.
* ADR explicitly states doctor remains read-only.
* ADR explicitly states upgrade is not the first-run setup command.

Blockers:

* None.

============================================================
T002 - Build init detection, planning, and dry-run foundation

Goal:
Create the non-mutating foundation for wk init: detect project facts, build a plan, and support dry-run output before any files are written.

Technical details:

* Add:
    src/cli/init-detection.ts
    src/cli/init-plan.ts
* Detection module should export:
    detectInitProjectContext(cwd: string): Promise
* Suggested types:
    type InitDetectionConfidence = “detected” | “defaulted” | “missing”;
    type InitDetectionResult = {
    projectName: string;
    packageManager: “pnpm” | “npm” | “yarn”;
    commands: {
    test: string;
    lint: string;
    typecheck: string;
    };
    github: {
    defaultBranch: string;
    remoteUrl?: string;
    };
    editorIntegrations: {
    cursor: boolean;
    vscode: boolean;
    };
    confidence: Record<string, InitDetectionConfidence>;
    warnings: string[];
    };
* Detection rules:
    * projectName:
        * package.json.name if present and non-empty.
        * Else current directory basename.
    * packageManager:
        * pnpm-lock.yaml => pnpm.
        * package-lock.json => npm.
        * yarn.lock => yarn.
        * package.json.packageManager prefix if available.
        * Else npm.
    * commands.test:
        * package.json.scripts.test.
        * Else echo “No test command configured”.
    * commands.lint:
        * package.json.scripts.lint.
        * Else echo “No lint command configured”.
    * commands.typecheck:
        * package.json.scripts.typecheck.
        * Else package.json.scripts.check.
        * Else echo “No typecheck command configured”.
    * github.defaultBranch:
        * origin HEAD if available.
        * Else current branch if available.
        * Else main.
    * github.remoteUrl:
        * git remote get-url origin if available.
    * editorIntegrations.cursor:
        * true if .cursor exists.
        * Default true if no editor integration exists, because Workflow Cannon currently generates Cursor rules.
    * editorIntegrations.vscode:
        * true if .vscode exists.
* Git failures must be non-fatal.
* Missing package.json must be non-fatal.
* Plan module should export:
    buildInitPlan(cwd: string, options: InitPlanOptions): Promise
* Suggested types:
    type InitMode = “fresh-install” | “repair” | “already-initialized”;
    type PlannedWrite = {
    path: string;
    action: “create” | “update” | “preserve” | “skip” | “initialize-sqlite”;
    reason: string;
    content?: string;
    isJson: boolean;
    };
    type InitPlan = {
    schemaVersion: 1;
    mode: InitMode;
    detected: InitDetectionResult;
    files: PlannedWrite[];
    warnings: string[];
    requiresConfirmation: boolean;
    };
* Planned files/actions should include:
    * workspace-kit.profile.json
    * schemas/workspace-kit-profile.schema.json
    * .workspace-kit/manifest.json
    * .workspace-kit/owned-paths.json
    * .workspace-kit/config.json
    * .workspace-kit/tasks/workspace-kit.db
    * .workspace-kit/generated/project-context.json
    * .cursor/rules/workspace-kit-profile-pointer.mdc
    * .cursor/rules/workspace-kit-project-context.mdc
* Reuse existing constants:
    * defaultWorkspaceKitPaths
    * profileSchemaContent
    * pointerRuleContent
    * currentOwnedPaths
* Refactor existing profile artifact rendering if needed so plan generation does not duplicate generated context logic.
* Add CLI support for:
    wk init –dry-run
    wk init –dry-run –json
* At this stage, dry-run can exist before full writing is implemented.
* dry-run must never write.

Acceptance criteria:

* Detection works in:
    * Empty temp directory.
    * Directory with package.json.
    * Directory with pnpm-lock.yaml.
    * Directory with package-lock.json.
    * Directory with yarn.lock.
    * Directory without git.
* Missing scripts produce placeholder commands and warnings.
* Init plan correctly identifies fresh-install.
* Init plan correctly identifies already-initialized when required files exist.
* Init plan correctly identifies partial/repair state.
* wk init –dry-run writes nothing.
* wk init –dry-run –json returns valid JSON with planned actions.
* Tests cover detection, plan output, and dry-run non-mutation.

Blockers:

* T001.

============================================================
T003 - Implement safe init writer, baseline file generation, config generation, and SQLite initialization

Goal:
Apply the init plan safely: create the baseline files, generate profile-derived artifacts, create/merge config, and initialize SQLite persistence without clobbering user files.

Technical details:

* Add:
    src/cli/init-writer.ts
    src/cli/init-sqlite.ts
* Writer should export:
    applyInitPlan(cwd: string, plan: InitPlan, options: ApplyInitPlanOptions): Promise
* Suggested options:
    {
    force?: boolean;
    dryRun?: boolean;
    backupRoot?: string;
    }
* Suggested result:
    {
    filesCreated: string[];
    filesUpdated: string[];
    filesPreserved: string[];
    backupsWritten: string[];
    warnings: string[];
    }
* Rules:
    * If dryRun is true, do not write.
    * Create parent directories recursively.
    * Use or generalize existing writeFileWithBackupIfChanged.
    * Back up existing changed files under:
        .workspace-kit/backups//
    * Preserve workspace-kit.profile.json by default.
    * Do not modify unknown user-owned files.
    * Do not delete anything.
* Baseline file generation:
    * workspace-kit.profile.json
        * Create from detection when missing.
        * Preserve when present.
    * schemas/workspace-kit-profile.schema.json
        * Generate from profileSchemaContent.
    * .workspace-kit/manifest.json
        * Include package name, package version, installedAt, lastUpgrade, and ownershipPolicyPath.
    * .workspace-kit/owned-paths.json
        * Include currentOwnedPaths.
    * .workspace-kit/generated/project-context.json
        * Generate from profile.
    * .cursor/rules/workspace-kit-profile-pointer.mdc
        * Generate from pointerRuleContent.
    * .cursor/rules/workspace-kit-project-context.mdc
        * Generate from profile.
* Config generation:
    * Create .workspace-kit/config.json when missing.
    * Default:
        {
        “schemaVersion”: 1,
        “tasks”: {
        “persistenceBackend”: “sqlite”,
        “sqliteDatabaseRelativePath”: “.workspace-kit/tasks/workspace-kit.db”
        }
        }
    * If config exists:
        * Parse if valid.
        * Merge missing task persistence fields only when safe.
        * Preserve unrelated keys.
        * If invalid JSON, preserve and warn unless force behavior says otherwise.
* SQLite initialization:
    * Create .workspace-kit/tasks/workspace-kit.db.
    * Use existing core SQLite preparation/migration function.
    * Do not hand-write SQLite schema in init.
    * If DB exists, open it and run existing preparation/migration path.
    * If native SQLite fails, surface existing native SQLite remediation hints.
* Add or complete –force support:
    * –force may update kit-owned generated/baseline files.
    * –force must not overwrite workspace-kit.profile.json.
    * If profile overwrite is ever needed, use a separate explicit future flag; do not add it here.
* Every overwritten file must be backed up.

Acceptance criteria:

* Fresh init plan can be applied and creates expected files.
* Existing profile is preserved.
* Existing unrelated config keys are preserved.
* SQLite DB is created through existing core prep path.
* Existing SQLite DB is not deleted.
* Existing drifted kit-owned files are not overwritten without –force.
* With –force, drifted kit-owned files are updated and backed up.
* init –dry-run still writes nothing.
* Tests verify:
    * fresh file creation.
    * config generation.
    * config merge.
    * SQLite DB creation.
    * backup creation.
    * force behavior.
    * profile preservation.

Blockers:

* T002.

============================================================
T004 - Preserve old init behavior as wk refresh-context and rebuild wk init as true attach/setup

Goal:
Change CLI semantics safely: move the old init behavior to refresh-context, then make init perform the new first-run attach workflow.

Technical details:

* Modify src/cli.ts or split command handlers into smaller modules if needed.
* Add top-level command:
    refresh-context
* refresh-context behavior:
    * Same as old init.
    * Validate workspace-kit.profile.json.
    * Regenerate .workspace-kit/generated/project-context.json.
    * Regenerate .cursor/rules/workspace-kit-project-context.mdc.
    * Record policy trace.
    * Use existing approval behavior or the ADR-defined equivalent.
* Rebuild top-level init:
    1. Parse flags:
        * –dry-run
        * –json
        * –yes
        * –approval-rationale 
        * –force
        * –no-starter-task
    2. Detect project context.
    3. Build init plan.
    4. Print human preview unless –json.
    5. Require approval unless dry-run:
        * Interactive TTY confirmation.
        * Or –yes –approval-rationale.
        * Or WORKSPACE_KIT_POLICY_APPROVAL.
    6. Apply init plan.
    7. Initialize SQLite.
    8. Run doctor validation.
    9. Print ready message.
* Add interactive confirmation helper:
    src/cli/interactive-confirm.ts
* Confirmation behavior:
    * Use TTY prompt only when interactive.
    * Use readStdinLine test hook if available.
    * Non-interactive without approval must fail and must not write.
    * User cancellation should exit cleanly with “Initialization cancelled. No files changed.”
* JSON output:
    * wk init –dry-run –json:
        {
        “ok”: true,
        “code”: “init-plan”,
        “schemaVersion”: 1,
        “data”: InitPlan
        }
    * successful wk init –json:
        {
        “ok”: true,
        “code”: “init-complete”,
        “schemaVersion”: 1,
        “data”: {
        “mode”: “…”,
        “filesCreated”: [],
        “filesUpdated”: [],
        “filesPreserved”: [],
        “sqlite”: {},
        “doctor”: {},
        “nextCommands”: []
        }
        }
* Human success output should include:
    * Detected project settings.
    * Files created/updated/preserved.
    * SQLite initialized.
    * Doctor result.
    * Next commands:
        wk start
        wk run get-next-actions ‘{}’
        wk run dashboard-summary ‘{}’
* Do not shell out to doctor; reuse internal validation functions.
* Return non-zero if post-init doctor fails.

Acceptance criteria:

* wk refresh-context reproduces old init behavior.
* wk init –dry-run works and writes nothing.
* wk init –yes –approval-rationale “test” works in empty repo.
* wk init with env approval works.
* wk init in non-interactive mode without approval fails without writing.
* Interactive yes proceeds.
* Interactive no cancels without writing.
* After wk init, wk doctor passes.
* wk init –json outputs valid JSON.
* Existing initialized repo is not clobbered.
* CLI tests for old init behavior are moved to refresh-context.

Blockers:

* T002.
* T003.

============================================================
T005 - Add starter task creation and wk start command

Goal:
Make a newly initialized repo feel immediately usable by creating an optional first task and providing a friendly status command.

Technical details:

* Starter task:
    * During wk init, unless –no-starter-task is passed, create a validation task.
    * Suggested title:
        Validate Workflow Cannon onboarding
    * Suggested acceptance criteria:
        * wk doctor passes.
        * wk start prints status.
        * wk run dashboard-summary ‘{}’ succeeds.
        * editor dashboard opens if enabled.
    * Use existing task-engine APIs/services, not raw SQLite writes.
    * Add metadata:
        {
        “createdBy”: “workspace-kit-init”,
        “starterTask”: true
        }
    * Idempotency:
        * Re-running init must not create a duplicate starter task.
        * Detect existing starter task by metadata if possible.
    * If task creation fails after setup:
        * Do not corrupt setup.
        * Prefer warning instead of total failure unless doctor cannot pass.
* Add:
    src/cli/start-command.ts
* Add top-level command:
    wk start
* wk start behavior before init:
    * Detect doctor missing baseline files.
    * Print:
        This repository is not attached to Workflow Cannon yet. Run wk init.
* wk start behavior after init:
    * Run doctor contract checks.
    * Read safe status/summary data.
    * Show task store status.
    * Show next action if available.
    * Show useful commands:
        wk run agent-bootstrap ‘{}’
        wk run get-next-actions ‘{}’
        wk run dashboard-summary ‘{}’
* Support:
    wk start –json
* JSON shape:
    {
    “ok”: true,
    “code”: “workspace-start”,
    “schemaVersion”: 1,
    “data”: {
    “doctorOk”: true,
    “nextActions”: [],
    “commands”: []
    }
    }

Acceptance criteria:

* Fresh wk init creates exactly one starter task by default.
* Re-running wk init does not duplicate the starter task.
* wk init –no-starter-task skips starter task creation.
* wk run get-next-actions ‘{}’ returns the starter task after fresh init.
* wk run dashboard-summary ‘{}’ works after fresh init.
* wk start before init tells the user to run wk init.
* wk start after init prints useful status.
* wk start –json returns valid JSON.
* Tests cover starter task default, idempotency, no-starter-task, and start before/after init.

Blockers:

* T004.
* Existing task creation service must be identified.

============================================================
T006 - Update doctor remediation, CLI help, and command discovery

Goal:
Make the CLI guide users through the new flow and stop recommending upgrade as the first-run repair for unattached repos.

Technical details:

* Update doctor missing-file remediation:
    * If required files are missing and .workspace-kit/manifest.json is missing:
        say repo is not attached yet.
        suggest wk init.
        suggest wk init –dry-run.
    * If manifest exists but setup is partial:
        suggest wk init –dry-run.
        suggest wk init –yes –approval-rationale “repair Workflow Cannon setup”.
        only suggest wk upgrade for package/baseline version refresh cases.
* doctor must remain read-only.
* Update top-level help:
    Start here:
    1. wk init
    2. wk start
    3. wk run get-next-actions ‘{}’
* Update command descriptions:
    * init: Attach Workflow Cannon to this repo and create first-run files.
    * refresh-context: Regenerate profile-derived project context artifacts.
    * start: Show doctor status, next action, and useful commands.
    * upgrade: Refresh kit-managed baseline files after package upgrades.
    * doctor: Validate setup.
    * run: List/run module commands.
    * config: Show/change kit config.
    * drift-check: Check managed asset drift.
* If top-level commands appear in any agent-facing command map or instruction surface, update those docs/surfaces.
* Update AGENT-CLI-MAP or equivalent docs:
    * wk init
    * wk init –dry-run –json
    * wk refresh-context
    * wk start
* Ensure no docs or CLI help say doctor is the first command for an uninitialized repo.

Acceptance criteria:

* wk doctor in empty repo points to wk init, not wk upgrade.
* wk doctor in partial repo points to repair/dry-run path.
* wk –help shows new happy path.
* wk –help distinguishes init, refresh-context, start, and upgrade.
* Agent-facing docs mention dry-run JSON before mutation.
* Tests verify doctor remediation and help output.

Blockers:

* T004.
* T005.

============================================================
T007 - Update README, runbook, changelog, roadmap, and docs consistency checks

Goal:
Make public and maintainer documentation match the new first-run UX and add a guard against future drift.

Technical details:

* Update README near the top with:
    Add Workflow Cannon to an existing project
    pnpm add -D @workflow-cannon/workspace-kit
    pnpm exec wk init
    pnpm exec wk start
    npm equivalent:
    npm install –save-dev @workflow-cannon/workspace-kit
    npx wk init
    npx wk start
* README should explain what wk init creates:
    * workspace-kit.profile.json
    * schemas/workspace-kit-profile.schema.json
    * .workspace-kit/manifest.json
    * .workspace-kit/owned-paths.json
    * .workspace-kit/config.json
    * .workspace-kit/tasks/workspace-kit.db
    * .workspace-kit/generated/project-context.json
    * editor/agent context rules
    * optional starter task
* README should explain:
    * wk init –dry-run
    * wk init –yes –approval-rationale “initial setup”
    * wk refresh-context after profile edits
    * wk upgrade after package upgrades
* Add or update maintainer runbook:
    docs/maintainers/runbooks/install-attach-workflow-cannon.md
* Runbook should include:
    * first-run flow
    * file ownership table
    * commit vs local-only recommendation
    * SQLite DB handling
    * starter task behavior
    * repair mode
    * force mode
    * dry-run mode
    * non-interactive approval
    * native SQLite troubleshooting
    * doctor validation behavior
    * refresh-context usage
* Update changelog:
    * New first-run wk init.
    * New wk refresh-context.
    * New wk start.
    * New dry-run/JSON init plan.
    * Doctor remediation update.
* Update roadmap/feature matrix source if required by repo conventions.
* Do not hand-edit generated docs if the repo requires source-driven generation.
* Add or extend docs consistency check:
    * README contains wk init before wk start.
    * CLI help contains wk init, wk start, and refresh-context.
    * Doctor remediation contains wk init for missing files.
    * Install/attach runbook exists.
    * No first-run docs recommend doctor before init.
* Add this check to the appropriate existing check stage.

Acceptance criteria:

* README happy path is correct.
* Maintainer runbook exists and is linked.
* Changelog records the behavior change.
* Roadmap/feature matrix source is updated if applicable.
* Docs consistency check fails on stale first-run flow.
* Existing docs checks pass.
* No stale first-run doctor-before-init instruction remains.

Blockers:

* T006.

============================================================
T008 - Add full init UX regression and integration test suite

Goal:
Cover the complete onboarding flow and prevent regressions.

Technical details:
Add or update tests covering:

1. Empty repo init:
    * Temp dir with no package.json and no git.
    * Run wk init –yes –approval-rationale “test”.
    * Verify expected files exist.
    * Run wk doctor.
    * Run wk start.
    * Run wk run get-next-actions ‘{}’.
    * Run wk run dashboard-summary ‘{}’.
2. Package metadata detection:
    * Temp dir with package.json:
        {
        “name”: “detected-app”,
        “scripts”: {
        “test”: “vitest run”,
        “lint”: “eslint .”,
        “typecheck”: “tsc –noEmit”
        }
        }
    * Add pnpm-lock.yaml.
    * Run init.
    * Verify profile and generated context contain detected values.
3. Missing scripts fallback:
    * package.json with no scripts.
    * Run init.
    * Verify placeholder commands and warnings.
    * Verify doctor passes.
4. Dry-run:
    * wk init –dry-run.
    * Verify no files exist.
    * wk init –dry-run –json.
    * Parse JSON.
    * Verify no files exist.
5. Non-interactive approval:
    * No –yes, no env approval.
    * Verify no writes and clear failure.
    * Env approval succeeds.
    * –yes –approval-rationale succeeds.
6. Existing repo preservation:
    * Existing workspace-kit.profile.json with custom values.
    * Run init.
    * Verify profile unchanged.
    * Drift a generated kit-owned file.
    * Run init without force.
    * Verify preserved/warned.
    * Run init –force.
    * Verify backup and update.
    * Verify profile still unchanged.
7. refresh-context regression:
    * Existing valid profile.
    * Run wk refresh-context.
    * Verify generated context files update.
    * Modify profile.
    * Run refresh-context.
    * Verify generated context changed.
8. Starter task:
    * Fresh init creates one starter task.
    * Re-running init does not duplicate it.
    * –no-starter-task skips it.
    * get-next-actions sees it.
9. wk start:
    * Before init suggests wk init.
    * After init prints doctor status and useful commands.
    * –json returns valid JSON.
10. Doctor remediation:

* Empty repo doctor says wk init.
* Partial repo doctor says dry-run/repair path.

Acceptance criteria:

* All listed test scenarios are implemented.
* Tests are deterministic.
* Tests do not require network access.
* Tests do not require actual GitHub access.
* Tests do not rely on the current working repo except where intentionally testing packaged command catalog behavior.
* Full pnpm run test passes.

Blockers:

* T004.
* T005.
* T006.

============================================================
T009 - Add detach dry-run ownership inspection

Goal:
Increase user trust by providing a safe way to see what Workflow Cannon owns and what removal would involve.

Technical details:

* Add top-level command:
    wk detach –dry-run
* Minimum scope:
    * Read .workspace-kit/owned-paths.json.
    * Print all owned paths.
    * Do not delete anything.
* If owned-paths is missing:
    * Use currentOwnedPaths fallback.
    * Print warning.
* If user runs wk detach without –dry-run:
    * Refuse for now or print that only –dry-run is supported.
* Output:
    Workflow Cannon owns these paths:
    workspace-kit.profile.json
    schemas/workspace-kit-profile.schema.json
    …
    No files were removed because this was a dry run.
* Optional JSON:
    wk detach –dry-run –json
* This task is lower priority than init/start, but it improves product trust.

Acceptance criteria:

* wk detach –dry-run works in initialized repo.
* wk detach –dry-run works with missing owned-paths using fallback warning.
* wk detach without –dry-run does not delete files.
* Tests verify dry-run output and no deletion.

Blockers:

* T004 or T006 preferred, but this can be deferred.

============================================================
T010 - Final validation, smoke test, and release evidence

Goal:
Prove the implementation meets the ideal UX and does not regress existing package behavior.

Technical details:

* Run:
    pnpm run build
    pnpm run check
    pnpm run test
    pnpm run parity
    pnpm run pre-merge-gates
* Manual smoke test in a temp project:
    mkdir /tmp/wk-smoke
    cd /tmp/wk-smoke
    npm init -y
    install local packed workspace-kit package using the repo’s normal package test flow
    npx wk init –yes –approval-rationale “smoke test”
    npx wk start
    npx wk doctor
    npx wk run get-next-actions ‘{}’
    npx wk run dashboard-summary ‘{}’
    npx wk init –dry-run
* Verify:
    * Expected files are created.
    * SQLite DB exists.
    * Doctor passes.
    * Start is useful.
    * get-next-actions works.
    * dashboard-summary works.
    * Re-running init is idempotent.
    * dry-run writes nothing.
    * Existing profile is preserved.
    * No files outside planned owned paths are unexpectedly changed.
* Record evidence according to repo release/maintainer process.

Acceptance criteria:

* All automated gates pass.
* Manual smoke test succeeds.
* Release evidence is recorded.
* There are no known regressions in existing CLI commands.
* The implementation satisfies the whole-plan Definition of Done.

Blockers:

* T001 through T008 complete.
* T009 optional unless included in release scope.

============================================================
Suggested implementation order

1. T001 - Define contract and docs direction.
2. T002 - Build detection/planning/dry-run foundation.
3. T003 - Implement writer/config/SQLite setup.
4. T004 - Add refresh-context and rebuild init.
5. T005 - Add starter task and wk start.
6. T006 - Update doctor remediation/help/agent command guidance.
7. T008 - Add full regression test suite.
8. T007 - Update README/runbook/changelog/docs checks.
9. T009 - Add detach dry-run ownership inspection.
10. T010 - Final validation and release evidence.

============================================================
Non-negotiable safety constraints

* doctor must remain read-only.
* init –dry-run must never write.
* init must not overwrite workspace-kit.profile.json by default.
* SQLite schema must be initialized through existing core preparation code.
* Existing env approval behavior must remain available for automation.
* Interactive local setup may use prompt confirmation instead of requiring manual env JSON.
* Existing generated-context behavior must remain available through refresh-context.
* upgrade must not be the recommended first-run command.
* Starter task creation must be idempotent.
* Existing changed kit-owned files must be backed up before overwrite.
* User-owned unknown files must never be deleted or modified.
* Re-running wk init must be safe.
* Tests must prove the ideal UX from a fresh temp repo.
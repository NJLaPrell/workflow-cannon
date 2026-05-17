# Retrospective Task Candidates

This file converts the phase/release transcript retrospective into task-engine-ready bug reports.

The common theme: the agent completed the work, but several moments relied on ad hoc AI reasoning, repeated shell attempts, or broad destructive operations where Workflow Cannon should provide deterministic commands, preview-first workflows, better policy gates, or reusable playbooks.

Each section below is written so an agent can convert it into a task-engine item.

Recommended task type: `defect` or `improvement`, depending on the task-engine taxonomy in use. Where the problem is risky behavior, prefer `defect`. Where the problem is missing deterministic automation, prefer `improvement` with `metadata.category: workflow-efficiency`.

---

## R001 — Add policy-gated remote branch cleanup preview/apply workflow

**Category:** defect / workflow-safety  
**Priority:** high  
**Suggested area:** branch-management, policy, git-operations

### Problem

The agent deleted every remote branch reported as merged into `main`, including historical `release/phase-*` branches, and only warned afterward that phase branches were gone from the remote.

### Cause

Workflow Cannon lacks a deterministic, policy-gated branch cleanup workflow. The agent used raw git shell commands and treated `merged into main` as sufficient authorization, even though deleting remote branches is externally destructive and should have a preview step.

### Chat transcript excerpt

```text
User: Yes, if that branch is on main, delete it. THen check each remote branch and delete any (NOT MAIN) that has been merged into main

Cursor: After `git fetch origin`, I took every `origin/*` ref that `git branch -r --merged origin/main` reported (excluding `origin/main` and `origin/HEAD`) and ran `git push origin --delete <branch>` for each. All deletes succeeded...

Cursor: Heads-up: nuking every merged `release/phase-*` is fine if you truly treat `main` as the only long-lived line; if you ever wanted those phase branches as historical handles, they’re gone from the remote now...
```

### User story

As a Workflow Cannon operator, I want branch cleanup to show a classified preview before deleting anything from the remote, so that I can avoid accidentally removing historical, active, or protected branch references.

### Acceptance criteria

- Add a read-only preview command that lists candidate remote branches for deletion.
- Classify branches at minimum as:
  - protected/default
  - merged feature/task branch
  - merged release/phase branch
  - unmerged branch
  - unknown/manual-review
- The preview must include exact branch names and the reason each branch is or is not safe to delete.
- Applying deletion must require explicit branch list confirmation and policy approval.
- `main`, `origin/HEAD`, default branch, and active/current phase branch are never deleted.
- Release/phase branches require a caution marker or separate explicit flag.
- Add tests for preview classification and refusal to delete protected branches.

### Suggested resolution

Add commands similar to:

```bash
wk run remote-branch-cleanup-preview '{}'
wk run remote-branch-cleanup-apply '{"branches":["feature/x"],"policyApproval":{"confirmed":true,"rationale":"delete merged stale remote branches"}}'
```

The apply command should only delete branches that appeared in a fresh preview or require a force flag with explicit rationale.

---

## R002 — Normalize GitHub PR check watcher states

**Category:** defect / workflow-noise  
**Priority:** medium  
**Suggested area:** github, ci, task-watchers

### Problem

A background shell task using `gh pr checks` returned exit code `8`, surfaced as an error, and required the agent to explain that it likely meant checks were pending or unavailable rather than actually failed.

### Cause

Workflow Cannon lacks a normalized PR-check watcher. Generic shell exit codes were surfaced without domain interpretation.

### Chat transcript excerpt

```text
system_notification: task status: error ... title: Wait and list PR 350 check status ... exit_code=8

Cursor: `gh pr checks` exit code 8 usually means checks weren’t ready yet (pending / nothing to report yet), not that CI failed.
```

### User story

As a Workflow Cannon operator, I want background PR check watchers to report meaningful check states instead of raw shell failures, so that pending checks do not create false alarm noise.

### Acceptance criteria

- Add a PR check status command or wrapper that returns normalized states:
  - `pending`
  - `passed`
  - `failed`
  - `no-checks-yet`
  - `merged`
  - `unknown-cli-error`
- Raw `gh` exit codes are captured but not exposed as the primary status.
- Pending/no-checks states do not report as task errors.
- Failed checks include failing check names and URLs when available.
- Add tests using mocked `gh` outputs/exit codes, including exit code `8`.

### Suggested resolution

Add:

```bash
wk run pr-check-status '{"pr":350,"wait":true,"timeoutSeconds":300}'
```

Use this wrapper in background check tasks instead of raw `sleep && gh pr checks`.

---

## R003 — Improve doctor runtime compatibility diagnostics for newer Node majors

**Category:** defect  
**Priority:** high  
**Suggested area:** doctor, runtime-contract, node-compatibility

### Problem

Doctor complained about `runtime-node-wrong-major` when the machine used a newer Node major. The agent had to file and fix a bug task midstream.

### Cause

The runtime contract treated a newer Node major as wrong by definition instead of distinguishing unsupported old Node, newer compatible Node, and native ABI failures.

### Chat transcript excerpt

```text
Cursor: Side note: `pnpm run wk doctor` is still whining about `runtime-node-wrong-major` on this machine (Node 23 vs package `>=22 <23`).

User: File a bug task on the bitching doctor, then continue

Cursor: Created T100320 ... Doctor: `runtime-node-wrong-major` is harsh when Node is newer than package engines
```

### User story

As a Workflow Cannon operator, I want doctor to clearly distinguish unsupported runtime failures from compatible newer Node versions, so that valid environments do not interrupt phase work with misleading errors.

### Acceptance criteria

- Doctor differentiates:
  - too-old Node: blocking error
  - supported Node range: pass
  - newer but intended-compatible Node: pass or advisory based on engines policy
  - native module/ABI mismatch: blocking error with remediation
- Runtime contract and package `engines.node` expectations are tested together.
- Doctor remediation text explains whether the issue is Node version, ABI, architecture, or native dependency loading.
- Add regression tests for below-minimum, minimum, current supported, and one-major-newer Node values.

### Suggested resolution

Implement a runtime compatibility evaluator that reads the supported engine range and emits structured diagnostic codes rather than a single `runtime-node-wrong-major` path.

---

## R004 — Add deterministic branch mergeability check

**Category:** improvement / workflow-efficiency  
**Priority:** high  
**Suggested area:** git-operations, merge-preflight

### Problem

The agent manually checked whether several remote branches could merge into `main`, discovered `git merge-tree --quiet` was misleading, and had to rerun checks with full output / conflict parsing.

### Cause

Workflow Cannon lacks a canonical mergeability check command. The agent had to rediscover reliable git behavior through shell experimentation.

### Chat transcript excerpt

```text
Cursor: Fetching remotes and testing each branch for a clean merge into `origin/main` using `git merge-tree`...

Cursor: Heads-up: `git merge-tree --quiet` lied like a cheap rug here (exit 0 even when the non-quiet run shows conflicts). Ignore `--quiet` for this kind of gate; use the full output or grep `^CONFLICT`.
```

### User story

As an operator, I want Workflow Cannon to reliably tell me whether branches can merge into `main`, so that agents do not rely on fragile git command variants or manually parse conflict text.

### Acceptance criteria

- Add a read-only mergeability command that accepts one base and one or more heads.
- Output includes:
  - merge base SHA
  - whether merge is clean
  - conflict paths
  - conflict type classification where possible
  - binary conflict marker
  - generated/artifact conflict marker
- The command must not mutate the working tree.
- Tests cover clean merge, text conflict, binary conflict, and generated artifact conflict.

### Suggested resolution

Add:

```bash
wk run branch-mergeability-check '{"base":"origin/main","heads":["origin/release/phase-95"]}'
```

Do not rely on `git merge-tree --quiet`; parse full merge-tree output or use a temporary index/worktree strategy.

---

## R005 — Add abandoned branch triage classifier

**Category:** improvement / workflow-efficiency  
**Priority:** high  
**Suggested area:** branch-management, git-operations

### Problem

The agent manually determined which abandoned remote branches were worth merging, which were zombie branches already included in a release branch, and which were probably redundant.

### Cause

Workflow Cannon lacks branch archaeology tools. The agent performed ancestry and commit interpretation conversationally.

### Chat transcript excerpt

```text
User: Shit. I don't know why those were abandoned. Are they worth the trouble merging them?

Cursor: feature/T100276-dashboard-title-polish — Tip is already an ancestor of origin/release/phase-95...
Cursor: feature/T100272-phase-lines-below-agent — Same deal...
Cursor: release/phase-95 — this is the one that might be worth the pain...
Cursor: fix/v0.90.0-projections — probably skip in favor of phase-95
```

### User story

As a maintainer, I want Workflow Cannon to classify abandoned branches using git facts, task IDs, and PR ancestry, so that I can decide whether to merge, delete, or archive branches without relying on AI speculation.

### Acceptance criteria

- Add a branch triage command that reports:
  - unique commits vs `main`
  - whether branch tip is contained in another remote branch
  - PR association if discoverable
  - task IDs from branch names / commit messages
  - likely classification: `zombie`, `canonical-integration`, `divergent`, `superseded`, `unknown`
  - mergeability status using the mergeability command
- Output includes a recommendation and confidence level.
- No branches are deleted or merged by this command.

### Suggested resolution

Add:

```bash
wk run abandoned-branch-triage '{"base":"origin/main"}'
```

Support optional branch filters and JSON output for dashboard display.

---

## R006 — Add stale phase merge plan / preview workflow

**Category:** improvement / workflow-efficiency  
**Priority:** high  
**Suggested area:** phase-management, merge-preflight, git-operations

### Problem

The agent spent a large amount of effort manually resolving a stale `release/phase-95` merge into `main`, including repeated retries, aborting/restarting, custom reconciliation, restoring files, and cleaning resurrected artifacts.

### Cause

Workflow Cannon does not have a formal stale phase recovery workflow. The agent had to invent merge policy file-by-file.

### Chat transcript excerpt

```text
Cursor: Merge index is corrupted: it matches HEAD except for the changelog — phase-95 changes weren't staged. Aborting and redoing the merge...

Cursor: Identifying the issue: with conflicts, Git can leave some non-conflicted paths as "ours" ... Reapplying conflict fixes, then reconciling every HEAD..MERGE_HEAD diff...

Cursor: Resetting and running an improved full-tree reconcile...
```

### User story

As a Workflow Cannon maintainer, I want stale phase branches to produce a deterministic merge plan before conflict resolution begins, so that agents can apply consistent policy and avoid ad hoc retries.

### Acceptance criteria

- Add a read-only stale phase merge planner.
- The planner classifies conflicts and changed files into categories:
  - binary task DB
  - changelog/release metadata
  - package/version/schema snapshots
  - generated artifacts
  - registered deleted artifacts
  - dashboard/UI source
  - docs/playbooks
  - tests
- The planner recommends default resolution policy per category.
- It lists required validation commands based on affected areas.
- It does not mutate the working tree.
- Add a playbook for stale phase recovery.

### Suggested resolution

Add:

```bash
wk run stale-phase-merge-plan '{"source":"origin/release/phase-95","target":"origin/main"}'
```

Optionally add an apply helper later, but start with plan/report to avoid unsafe automation.

---

## R007 — Convert one-off merge reconciliation into supported tooling

**Category:** improvement / workflow-efficiency  
**Priority:** medium  
**Suggested area:** merge-preflight, scripts

### Problem

The agent created or referenced a one-off merge helper script while resolving Phase 95, then deleted it to avoid committing temporary automation.

### Cause

The agent needed deterministic merge assistance, but Workflow Cannon has no maintained script or command for this workflow.

### Chat transcript excerpt

```text
Cursor: I nuked the one-off `scripts/_merge-resolve-phase95.py` helper during cleanup so it wouldn’t accidentally land in the merge commit—if you want that automation back, say so and we can re-add it properly...
```

### User story

As a maintainer, I want recurring merge recovery automation to live in tested Workflow Cannon tooling, so that agents do not create disposable scripts during high-risk merges.

### Acceptance criteria

- Add a maintained script or module command for phase merge preview/reconciliation helpers.
- The script is general, not hard-coded to Phase 95.
- It supports dry-run/report mode first.
- It is documented in the stale phase recovery playbook.
- Tests cover at least fixture-based conflict classification.

### Suggested resolution

Create either:

```bash
scripts/merge-phase-preview.mjs
```

or a module command:

```bash
wk run phase-merge-preview '{"phaseKey":"95","target":"main"}'
```

Prefer the module command if it can reuse task/phase metadata.

---

## R008 — Prevent registered deleted artifacts from being resurrected during merges

**Category:** defect / governance  
**Priority:** high  
**Suggested area:** documentation-governance, merge-preflight

### Problem

During the stale Phase 95 merge, deleted root artifacts such as `dashboard_out.json`, `dashboard_summary.json`, `tasks.json`, and stray runtime/output files had to be manually removed or reset.

### Cause

Workflow Cannon has a documentation deletion register, but merge workflows do not actively consult it to prevent deleted registered files from reappearing.

### Chat transcript excerpt

```text
Cursor: Phase 96 deletion register — Did not resurrect `dashboard_out.json` / `dashboard_summary.json` / `tasks.json` / stray `.workspace-kit/runtime.json`.

Cursor: output.json — Reset to HEAD so `git merge-file` didn’t blow it up to 50k+ lines of nonsense again.
```

### User story

As a maintainer, I want Workflow Cannon to detect when a merge resurrects files that were intentionally deleted, so that stale branches do not undo documentation cleanup or artifact removal.

### Acceptance criteria

- Add a merge guard that checks changed files against deletion registers.
- Registered deleted files that reappear are reported as errors unless explicitly overridden.
- The report includes deletion reason, replacement path, task refs, and evidence from the register.
- Add tests with a fixture deletion register and resurrected file.

### Suggested resolution

Add:

```bash
wk run deletion-register-merge-guard '{}'
```

Then include it in stale phase merge preflight and/or doc governance checks.

---

## R009 — Add deterministic task DB reconciliation policy for merges

**Category:** improvement / workflow-safety  
**Priority:** high  
**Suggested area:** task-engine, persistence, merge-preflight

### Problem

The SQLite task DB conflicted during merges and the agent chose `main`/ours rather than trying to merge binary state.

### Cause

Workflow Cannon tracks important task state in a binary SQLite file that is branch-sensitive and conflict-prone. There is no deterministic task DB reconciliation command for phase merges.

### Chat transcript excerpt

```text
Cursor: Binary SQLite task DB — Kept `--ours` (`main`). No Frankenstein merge on `workspace-kit.db`.
```

### User story

As a maintainer merging branches, I want Workflow Cannon to report what task state would be lost or retained when choosing one SQLite DB over another, so that binary conflict resolution is explicit and auditable.

### Acceptance criteria

- Add a read-only task DB reconciliation report for two refs/branches.
- The report lists task rows/transitions present only on source, only on target, and divergent between both.
- The command recommends a policy: keep target, replay source transitions, or manual review.
- It never attempts binary merge.
- Add tests using fixture task stores.

### Suggested resolution

Add:

```bash
wk run task-db-reconcile '{"source":"origin/release/phase-95","target":"origin/main","mode":"report"}'
```

Longer-term, consider storing task transitions in append-only JSONL or export artifacts so SQLite can be rebuilt locally.

---

## R010 — Add affected-area dashboard/UI smoke test planner

**Category:** improvement / workflow-efficiency  
**Priority:** high  
**Suggested area:** dashboard, testing, extension

### Problem

After resolving dashboard conflicts, the agent manually reasoned that the most likely risk was cross-file mismatch among `render-dashboard.ts`, `DashboardViewProvider.ts`, `dashboard-input-drawer.ts`, and `render-status-tab.ts`.

### Cause

Workflow Cannon lacks an affected-area test planner that maps changed files to relevant automated and manual smoke tests.

### Chat transcript excerpt

```text
Cursor: What’s most likely to be “off” in the dashboard UI?

Cursor: The highest-risk mismatches are cross-file behavior, not “HTML looks fine at a glance”: `render-dashboard.ts` vs `dashboard-input-drawer.ts` / `render-status-tab.ts`...
```

### User story

As an agent working on dashboard files, I want Workflow Cannon to identify the right smoke tests and manual checks based on changed files, so that UI regressions are tested consistently.

### Acceptance criteria

- Add an affected-area test planner command.
- For dashboard-related changed files, output includes:
  - build command
  - extension compile command
  - dashboard render tests
  - drawer tests
  - status tab tests
  - manual VS Code webview smoke checklist
- The planner supports JSON output for agent workflows.
- Add a dashboard test manifest mapping files to tests/checks.

### Suggested resolution

Add:

```bash
wk run affected-area-tests '{"changedFiles":["extensions/cursor-workflow-cannon/src/views/dashboard/render-dashboard.ts"]}'
wk run smoke-test-plan '{"area":"dashboard"}'
```

---

## R011 — Add dashboard merge contract tests for cross-file behavior

**Category:** improvement / test-coverage  
**Priority:** medium  
**Suggested area:** dashboard, extension, testing

### Problem

To get the extension compiling, the agent restored some dashboard support files from `main` while leaving other merged dashboard files in place, then warned that small Phase-95-only UI deltas might have been dropped.

### Cause

Dashboard behavior relies on cross-file contracts that are not fully captured by tests or schema contracts.

### Chat transcript excerpt

```text
Cursor: Extension compile — `merge-file` had mauled `render-status-tab.ts` and `dashboard-input-drawer.ts` ... Both are restored from HEAD...

Cursor: Residual risk: Restoring `render-status-tab.ts` and `dashboard-input-drawer.ts` from `main` may drop small phase-95-only edits...
```

### User story

As a dashboard maintainer, I want cross-file dashboard contracts tested so that restoring or merging individual files cannot silently break drawer/status/provider behavior.

### Acceptance criteria

- Add tests that exercise `DashboardViewProvider` assumptions against rendered dashboard/drawer/status payload shapes where feasible.
- Add fixture `dashboard-summary` payloads for older and current schemas.
- Verify drawer action IDs, postMessage commands, and rendered DOM markers expected by provider code.
- Include these tests in extension test suite.

### Suggested resolution

Extend extension tests around dashboard render/provider contracts and add a manifest that documents the contract between renderer, drawer, status tab, and provider message handling.

---

## R012 — Add native probe diagnostics and realistic fixture utilities

**Category:** defect / test-reliability  
**Priority:** medium  
**Suggested area:** extension, runtime, tests

### Problem

Two extension tests initially failed and were described as environment/native SQLite issues. Later the root cause was identified as bad test fixtures using a fake `better-sqlite3` stub, causing every Node candidate to fail the native probe.

### Cause

The test fixture did not represent a real native dependency tree, and Workflow Cannon had no diagnostic helper to separate environment failure from invalid fixture setup.

### Chat transcript excerpt

```text
Cursor: Full extension package ... 144 pass, 2 fail ... Node/native SQLite arch probing — environment-specific...

Cursor: Those two tests were wrong in setup, not flaky on “arm64 vs x86_64” per se: a fake `better-sqlite3` made every Node fail the native probe...
```

### User story

As a maintainer, I want native runtime probe tests to use realistic fixtures and diagnostics, so that agents do not misclassify fixture failures as environment problems.

### Acceptance criteria

- Add shared test utilities for native probe tests that locate a real workspace-kit package root.
- Add a diagnostic command or helper that reports Node path, arch, ABI, package root, and native dependency load result.
- Update tests to avoid fake native module trees where the test expects a real probe.
- Add guidance: do not classify native probe failure as environment-specific until fixture validity is checked.

### Suggested resolution

Add helper utilities around:

```text
workspaceKitRepoRoot()
realNativeDependencyFixture()
fakeBadNode()
```

Optionally add:

```bash
wk run native-probe-diagnostics '{}'
```

---

## R013 — Add PR preflight review command

**Category:** improvement / workflow-efficiency  
**Priority:** high  
**Suggested area:** github, review, validation

### Problem

The agent performed PR review by manually gathering PR details, diff context, CI status, and then discovered a failing orphan `.ai` coverage check.

### Cause

Workflow Cannon lacks a deterministic PR preflight that aggregates known repo gates and likely review risks.

### Chat transcript excerpt

```text
User: Do the PR review.

Cursor: Gathering PR #359 details, diff, and CI status for a structured review.

Cursor: CI blocker ... failed on `check-orphan-ai-sources` ... two `.ai` files reappeared from the phase branch without entries...
```

### User story

As a maintainer reviewing a Workflow Cannon PR, I want a structured PR preflight report that identifies blockers and known-risk areas before an AI writes review prose.

### Acceptance criteria

- Add a command that accepts a PR number or branch/ref pair.
- Report includes:
  - CI status
  - failing gates
  - changed file categories
  - generated docs drift / orphan `.ai` source risk
  - task DB changes/conflicts
  - changelog/version/schema coherence
  - recommended test commands
  - known manual smoke areas
- Output is JSON and text-renderable.

### Suggested resolution

Add:

```bash
wk run pr-preflight '{"pr":359}'
```

Use this output to seed PR review comments.

---

## R014 — Add automatic `.ai` documentation coverage repair proposal

**Category:** improvement / documentation-governance  
**Priority:** medium  
**Suggested area:** documentation, ai-to-docs-coverage

### Problem

The merge reintroduced `.ai` docs without entries in `docs/maintainers/data/ai-to-docs-coverage.json`; the agent manually added mappings.

### Cause

The orphan `.ai` check detects the problem, but Workflow Cannon lacks an apply/propose command to generate the obvious coverage mappings.

### Chat transcript excerpt

```text
Cursor: CI blocker ... `check-orphan-ai-sources` — two `.ai` files reappeared ... without entries in `docs/maintainers/data/ai-to-docs-coverage.json`:
- `.ai/runbooks/documentation-governance-checks.md`
- `.ai/workbooks/README.md`

Cursor: I added both mappings and pushed...
```

### User story

As a docs maintainer, I want Workflow Cannon to propose or apply coverage mappings for orphan `.ai` docs, so that mechanical mapping fixes do not require AI/manual editing.

### Acceptance criteria

- Add a command to list orphan `.ai` docs with suggested maintainer mirror paths.
- Add an apply mode that updates `ai-to-docs-coverage.json` for unambiguous cases.
- Generated changes are previewed before writing.
- Existing mappings are preserved.
- Add tests for runbook, workbook, ADR, and unmatched custom paths.

### Suggested resolution

Add:

```bash
wk run fix-ai-doc-coverage '{"mode":"propose"}'
wk run fix-ai-doc-coverage '{"mode":"apply","policyApproval":{"confirmed":true,"rationale":"add missing ai docs coverage mappings"}}'
```

---

## R015 — Add release strategy command for semver decisioning

**Category:** improvement / release-efficiency  
**Priority:** high  
**Suggested area:** release, npm, versioning

### Problem

The user asked how to release the previously missing phase. The agent reasoned conversationally that Phase 95 is not a semver line and that, because `0.91.0` was already published while `main` had moved, the release should be `0.91.1`.

### Cause

Workflow Cannon lacks a deterministic release strategy command that compares package version, npm publication state, tags, and commits since publish.

### Chat transcript excerpt

```text
User: Now how should we do the build/publish/release/etc for that previously missing phase?

Cursor: You’re not “releasing phase 95” in isolation; you’re releasing the next kit version from `main`...

Cursor: npm already has `0.91.0`; `main` includes post-publish commits — we must bump semver before publishing.
```

### User story

As a release operator, I want Workflow Cannon to tell me whether the current package version can be published or must be bumped, so that releases do not rely on conversational semver reasoning.

### Acceptance criteria

- Add a release strategy command that reports:
  - current package version
  - whether that version exists on npm
  - current git tag status
  - commits on `main` since the tag/publish commit
  - recommended next version or `publish-current`
  - rationale
- Command is read-only.
- Tests mock npm/tag states.

### Suggested resolution

Add:

```bash
wk run release-strategy '{}'
```

Example output:

```json
{
  "currentPackageVersion": "0.91.0",
  "npmPublished": true,
  "mainHasUnpublishedCommits": true,
  "recommendedVersion": "0.91.1",
  "reason": "0.91.0 already exists on npm and main has new commits"
}
```

---

## R016 — Add release version preparation command

**Category:** improvement / release-efficiency  
**Priority:** medium  
**Suggested area:** release, schemas, changelog

### Problem

The agent manually bumped `package.json`, run-contract schema package version, pilot snapshot, and changelog entries before publishing `0.91.1`.

### Cause

Version preparation touches multiple deterministic files, but Workflow Cannon does not provide a single command to apply the version bump consistently.

### Chat transcript excerpt

```text
Cursor: Bumping to v0.91.1 — v0.91.0 is already on npm; `main` contains additional commits. Applying version bumps and changelog, then running validation and dispatching publish.

Cursor: Version: `0.91.1` (`package.json`, run-contract schema `packageVersion`, pilot snapshot refresh).
```

### User story

As a release operator, I want one command to prepare a release version across package metadata, schemas, snapshots, and changelog, so that version bumps are consistent and testable.

### Acceptance criteria

- Add a command that accepts target version and release rationale.
- It updates all required version-coupled files.
- It updates changelog sections or creates a TODO block for release notes.
- It supports dry-run mode.
- It runs or reports required validation commands.
- Add tests for patch/minor bump file updates.

### Suggested resolution

Add:

```bash
wk run prepare-release-version '{"version":"0.91.1","reason":"deferred Phase 95 integration"}'
```

---

## R017 — Add release closeout workflow command

**Category:** improvement / release-efficiency  
**Priority:** high  
**Suggested area:** release, evidence, phase-status

### Problem

The release required several user prompts and separate steps: publish, GitHub Release, phase metadata sync, and release evidence bookkeeping.

### Cause

Workflow Cannon treats release closeout as a collection of related actions instead of one done-definition workflow.

### Chat transcript excerpt

```text
User: Do the release. I approve

Cursor: 0.91.1 is live on npm... Optional follow-ups: gh release create... set-current-phase / phase snapshot YAML...

User: Yes. Finish up the current release.

User: Do the bookkeeping
```

### User story

As a release operator, I want one release closeout workflow to drive publish, GitHub Release, phase sync, and evidence capture, so that release completion does not depend on multiple chat prompts.

### Acceptance criteria

- Add a release closeout command/playbook that covers:
  - validation gates
  - npm publish dispatch/status
  - npm package verification
  - tag verification
  - GitHub Release creation
  - phase status/export sync
  - release evidence manifest generation/persistence
  - final clean tree / pushed state check
- Each step can be skipped only with explicit waiver/rationale.
- Output includes final release summary and artifact URLs.
- Add tests for dry-run plan generation.

### Suggested resolution

Add:

```bash
wk run release-closeout '{"version":"0.91.1","phaseKey":"95","publish":true,"githubRelease":true,"evidence":true,"phaseSync":true}'
```

---

## R018 — Add release preflight phase-status drift gate

**Category:** defect / release-safety  
**Priority:** medium  
**Suggested area:** release, phase-status, config

### Problem

After publishing, the agent discovered phase hints/config were stale: `kit.currentPhaseNumber` / label were stuck at 95 while SQLite already said 97.

### Cause

Phase status drift was not checked before publishing. Drift was found as post-publish hygiene instead of release preflight.

### Chat transcript excerpt

```text
Cursor: set-current-phase — `kit.currentPhaseNumber` / label were stuck at 95 while SQLite already said 97; aligned hints + bumped workspaceRevision...

Cursor: phase-status — no drift now; export fresh.
```

### User story

As a release operator, I want release preflight to detect phase-status drift before publish, so that released state and workspace phase metadata are coherent.

### Acceptance criteria

- Release preflight runs `phase-status` or equivalent drift check.
- Drift between SQLite phase state, config hints, and exported YAML is reported before publish.
- Blocking vs advisory behavior is configurable but must be visible.
- Release closeout rechecks freshness after phase sync.
- Add tests with stale config/export fixtures.

### Suggested resolution

Add phase-status drift to:

```bash
wk run release-preflight '{}'
```

and make `release-closeout` call it before publish.

---

## R019 — Make release evidence manifest part of required closeout

**Category:** improvement / release-governance  
**Priority:** high  
**Suggested area:** release, evidence

### Problem

Release evidence manifest with publish artifacts was generated only after the user asked for bookkeeping.

### Cause

Evidence capture is treated as optional bookkeeping instead of part of release completion.

### Chat transcript excerpt

```text
Cursor: If you want a `release-evidence-manifest` re-run with `publishArtifacts` filled ... say so and I’ll fire it; it’s optional bookkeeping...

User: Do the bookkeeping

Cursor: Ran `release-evidence-manifest` with publishArtifacts...
```

### User story

As a maintainer, I want release evidence manifest generation to be a required closeout step, so that every release has durable proof of package, CI, tag, GitHub Release, and validation artifacts.

### Acceptance criteria

- Release closeout requires evidence manifest generation unless explicitly waived.
- Manifest includes npm URL, publish workflow URL, GitHub Release URL, git tag/SHA, validation commands, risks, and phase/task evidence.
- Manifest is persisted under `docs/maintainers/data/` with a versioned filename.
- Add tests for manifest path/name construction and required artifact validation.

### Suggested resolution

Integrate `release-evidence-manifest` into `release-closeout` and remove language that presents it as optional by default.

---

## R020 — Add scope-gap disposition requirement before task completion

**Category:** defect / governance  
**Priority:** medium  
**Suggested area:** task-engine, delivery-evidence

### Problem

The agent noted several honest gaps against broad task scope, such as not adding stale phase/version heuristics or not moving medium-confidence docs, but those gaps were not consistently converted into follow-up tasks, waivers, or acceptance criteria updates.

### Cause

Workflow Cannon does not require structured disposition when a delivery summary says part of the task scope was not done.

### Chat transcript excerpt

```text
Cursor: Honest gap vs the fat scope line: We did not add heuristics for “stale phase/version strings in prose”...

Cursor: Caveat ... This slice was delete-only ... The task text also mentioned medium-confidence archive moves; we did not reshuffle maintainer navigation...
```

### User story

As a maintainer, I want any declared delivery gap to require a waiver, follow-up task, or acceptance clarification before completion, so that partial scope does not disappear into prose.

### Acceptance criteria

- Add optional/strict delivery evidence validation for scope-gap disposition.
- If delivery notes include structured `deliveryGaps`, each gap must include one disposition:
  - follow-up task ID
  - waiver rationale
  - acceptance criteria update reference
  - user confirmation reference
- Add docs/playbook guidance for recording gaps.
- Add tests for delivery evidence with and without gap dispositions.

### Suggested resolution

Extend delivery evidence metadata with:

```json
{
  "deliveryGaps": [
    {
      "summary": "Stale phase/version prose heuristics not implemented",
      "disposition": "follow-up-task",
      "taskId": "T..."
    }
  ]
}
```

Optionally add a lightweight text heuristic that warns when summary text contains phrases like `did not`, `not implemented`, or `gap` without structured disposition.

---

## R021 — Add task/diagnostic capture command for observed tool failures

**Category:** improvement / workflow-efficiency  
**Priority:** medium  
**Suggested area:** task-engine, diagnostics

### Problem

When doctor produced a runtime warning/error, the user asked the agent to file a bug. The agent manually created a task with title, scope, phase, priority, feature area, and acceptance criteria.

### Cause

Workflow Cannon lacks a deterministic command to turn an observed diagnostic into a structured defect task.

### Chat transcript excerpt

```text
User: File a bug task on the bitching doctor, then continue

Cursor: Created T100320 (ready, Phase 96, P3) for the doctor/runtime Node engines mismatch.
```

### User story

As an operator, I want to capture a current diagnostic as a task with evidence and suggested acceptance criteria, so that bug task creation is consistent and low-token.

### Acceptance criteria

- Add a command that accepts diagnostic source/code and optional phaseKey.
- It creates or previews a defect task with:
  - title
  - observed diagnostic
  - reproduction context
  - acceptance criteria
  - feature/category metadata
  - priority suggestion
- It deduplicates against existing open tasks with the same diagnostic code.
- Add tests for doctor diagnostic capture.

### Suggested resolution

Add:

```bash
wk run capture-diagnostic-task '{"source":"doctor","code":"runtime-node-wrong-major","phaseKey":"96"}'
```

---

## R022 — Add deterministic phase-next / phase-chain status commands

**Category:** improvement / workflow-efficiency  
**Priority:** high  
**Suggested area:** task-engine, phase-management

### Problem

The user repeatedly said “keep going,” and the agent repeatedly rediscovered the next Phase 96 task, task state, delivery policy, branch context, and next action.

### Cause

Workflow Cannon has task listing and next-action primitives, but no concise phase-pinned command that returns exactly what an agent should do next for a phase chain.

### Chat transcript excerpt

```text
User: Keep going
Cursor: Driving T100196 ... Pulling task details and starting the delivery loop.

User: Keep going
Cursor: Driving T100198 ... Fetching task state and opening the delivery loop.

User: Yes, keep to phase 96 tasks
Cursor: Continuing Phase 96: pulling latest release/phase-96, loading T100200 scope...
```

### User story

As an operator driving a phase, I want the agent to retrieve the next phase-specific task and required delivery context in one command, so that it does not waste time rediscovering workflow state after every “keep going.”

### Acceptance criteria

- Add a command that accepts `phaseKey` and returns:
  - next ready/in-progress task
  - dependency reason
  - current planning generation
  - suggested branch
  - required playbook
  - required validation commands
  - exact suggested `run-transition start` command
- Add a phase chain summary command that lists remaining tasks and blockers.
- The command must ignore global next-action suggestions unless requested.

### Suggested resolution

Add:

```bash
wk run phase-next '{"phaseKey":"96"}'
wk run phase-chain-status '{"phaseKey":"96"}'
```

---

## R023 — Add delivery summary generator

**Category:** improvement / workflow-efficiency  
**Priority:** medium  
**Suggested area:** task-engine, reporting

### Problem

After each task, the agent generated rich summaries listing shipped files, PR, merge SHA, evidence, task DB commit, and next task. These are useful but formulaic and token-heavy.

### Cause

Workflow Cannon lacks a structured delivery summary generator that reads task metadata, PR/evidence metadata, and phase state.

### Chat transcript excerpt

```text
Cursor: T100199 is done. Here is what landed and how the kit was closed out.

Cursor: Delivery / evidence
- PR: ... merged into release/phase-96
- update-task attached deliveryEvidence; run-transition complete succeeded...
```

### User story

As an agent, I want Workflow Cannon to generate a delivery summary from task evidence, so that status reporting is consistent and does not burn AI tokens reconstructing facts.

### Acceptance criteria

- Add a delivery summary command for a task ID.
- It reads task metadata, delivery evidence, transition state, PR URL, merge SHA, validation commands, and next phase task if available.
- It emits JSON and a compact text/markdown version.
- Add tests using fixture tasks with delivery evidence.

### Suggested resolution

Add:

```bash
wk run delivery-summary '{"taskId":"T100199"}'
wk run phase-progress-summary '{"phaseKey":"96"}'
```

---

## R024 — Add PR review comment responder/preflight follow-up support

**Category:** improvement / workflow-efficiency  
**Priority:** medium  
**Suggested area:** github, review, agent-workflow

### Problem

After the PR review, the user asked the agent to address the PR comment and leave a response. The agent fetched comments, identified actionable items, fixed tests, ran suite, pushed, and commented.

### Cause

Workflow Cannon lacks a structured PR comment action workflow that distinguishes actionable comments, already-addressed comments, and informational comments.

### Chat transcript excerpt

```text
User: Great. Address the PR comment and leave a response

Cursor: Fetching PR #359 comments and addressing actionable items.

Cursor: Posted a follow-up comment on PR #359 summarizing the above...
```

### User story

As a maintainer, I want Workflow Cannon to summarize PR comments into actionable items and track which have been addressed, so that agents do not manually infer review state each time.

### Acceptance criteria

- Add a PR comment review command that lists comments and classifies them:
  - actionable
  - question
  - informational
  - already addressed
- Add optional response drafting based on commits since the comment.
- No GitHub write occurs without explicit approval.
- Add tests with mocked PR comments.

### Suggested resolution

Add:

```bash
wk run pr-comment-actions '{"pr":359}'
wk run pr-comment-response-draft '{"pr":359,"commentId":"..."}'
```

---

## Suggested initial task-engine import order

If importing these into the task engine, start with the highest-leverage infrastructure tasks:

1. R001 — policy-gated remote branch cleanup preview/apply.
2. R004 — deterministic branch mergeability check.
3. R005 — abandoned branch triage classifier.
4. R006 — stale phase merge plan / preview workflow.
5. R017 — release closeout workflow command.
6. R015 — release strategy command.
7. R022 — phase-next / phase-chain status commands.
8. R010 — affected-area dashboard/UI smoke test planner.
9. R008 — deletion-register merge guard.
10. R009 — task DB reconciliation policy for merges.

These give the biggest reduction in AI token burn and the largest safety improvement for future phase/release work.

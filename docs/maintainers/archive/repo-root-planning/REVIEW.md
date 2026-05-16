# Workflow Cannon Refactor Review Plan

This document defines the process for a full-codebase refactor review of Workflow Cannon. The goal is not to find ordinary implementation bugs. The goal is to find architecture debt, legacy code, orphaned components, stale generated surfaces, duplicated responsibilities, source-of-truth drift, and opportunities to make the system simpler and easier to evolve.

Use this plan when an agent or maintainer needs a 100% coverage architectural cleanup review.

## Review Goal

The review should answer these questions:

- What code, docs, tests, scripts, schemas, fixtures, artifacts, commands, or extension components no longer appear to serve a current purpose?
- What is retained only for compatibility, and what evidence explains that compatibility requirement?
- Which responsibilities live in the wrong layer or cross module boundaries in ways that increase future maintenance cost?
- Which command, schema, documentation, task, or extension surfaces duplicate each other or drift from canonical sources?
- Which one-off phase files, legacy scripts, generated mirrors, fixtures, or historical artifacts should be retired, archived, regenerated, or moved?
- Which changes are safe removals, which need staged deprecation, and which need a design decision before implementation?

The deliverable is a refactor opportunity report with evidence. It is not a merge-readiness review, security audit, or bug bash, although architecture findings may include safety, compatibility, or operability risk when those risks are caused by stale or tangled structure.

## Process Sources

Use these external sources as process input, interpreted through a refactoring lens:

- Google Engineering Practices for code review: emphasize design, complexity, maintainability, consistency, documentation, whole-file context, and whether the codebase is healthier after the change.
- GitHub pull request review documentation: understand intent first, review files systematically, track viewed files, review dependency changes, and re-review updates.
- Microsoft Azure DevOps pull request review documentation: inspect overview, files, updates, commits, comments, and reviewer state so no changed context is missed.
- OWASP Secure Code Review guidance: use baseline review methodology for architecture, entry points, trust boundaries, data flow, and business logic. For this review, these become responsibility and coupling maps before they become vulnerability checks.
- NIST Secure Software Development Framework: focus on secure, maintainable development practices, root-cause prevention, evidence, and continuous improvement.

Use these Workflow Cannon sources as binding local guidance:

- [AGENTS.md](AGENTS.md)
- [.ai/agent-source-of-truth-order.md](.ai/agent-source-of-truth-order.md)
- [.ai/PRINCIPLES.md](.ai/PRINCIPLES.md)
- [.ai/module-build.md](.ai/module-build.md)
- [.ai/machine-cli-policy.md](.ai/machine-cli-policy.md)
- [.ai/WORKSPACE-KIT-SESSION.md](.ai/WORKSPACE-KIT-SESSION.md)
- [.ai/MACHINE-PLAYBOOKS.md](.ai/MACHINE-PLAYBOOKS.md)
- [src/README.md](src/README.md)
- [src/modules/README.md](src/modules/README.md)
- [package.json](package.json)
- [pnpm-workspace.yaml](pnpm-workspace.yaml)

Do not use generated or maintainer-facing prose under `docs/maintainers/` as the agent operating source when a canonical `.ai` or module instruction source exists. Maintainer docs are review targets for drift and generated-surface health, not the primary source of agent procedure.

## Definition Of 100% Coverage

For this review, 100% coverage means every non-vendored, non-build-output file and every registered runtime surface is classified in a review ledger.

Exclude only clear implementation noise such as `.git/`, `node_modules/`, `dist/`, editor caches, and transient local files. Do not automatically exclude artifacts, fixtures, generated docs, or historical phase files. Classify them with an appropriate status instead.

Each reviewed item must receive one status:

- `active-keep`: current purpose and ownership are clear.
- `active-refactor`: used, but the architecture should be improved.
- `legacy-compat`: retained for compatibility; owner, contract, and removal condition are known.
- `deprecated-remove`: should be removed after a documented migration, replacement, or phase boundary.
- `orphan-candidate`: no current references, runtime surface, owner, or documented purpose found after multiple checks.
- `generated-or-derived`: derived from another source; review the generator and source of truth.
- `artifact-evidence`: evidence or release output; inspect freshness, provenance, package relevance, and secret risk rather than line-reviewing as source.
- `needs-human-decision`: technical evidence is incomplete or the tradeoff requires maintainer judgment.

The review is incomplete until every file, module, command, schema, script, test, fixture, documentation surface, package export, CI workflow, artifact class, and Cursor extension contribution has a ledger entry or an explicit group entry.

## Expected Deliverables

Create these review artifacts in a review branch or external review workspace unless the maintainer asks to persist them in the repository:

- `review-ledger.json`: coverage ledger for files and runtime surfaces.
- `architecture-map.md`: package exports, binaries, modules, commands, extension surfaces, storage surfaces, and canonical docs.
- `refactor-opportunities.md`: prioritized architecture cleanup findings.
- `orphan-candidates.md`: possible removals with reference evidence and recommended disposition.
- `legacy-compatibility-register.md`: compatibility code that should remain for now, with removal conditions.
- `proposed-tasks.json`: draft Workspace Kit task payloads for accepted cleanup work.

Persist task changes only through Workspace Kit task-engine commands. Do not hand-edit `.workspace-kit/tasks/workspace-kit.db` or any legacy task-state file.

## Step-By-Step Agent Plan

### 1. Preflight The Environment

1. Confirm the working tree state with `git status --short`.
2. Confirm Node matches [.nvmrc](.nvmrc) and [.node-version](.node-version).
3. Confirm `pnpm` is available and matches the package manager declared in [package.json](package.json).
4. Run `pnpm install --frozen-lockfile` when dependencies are missing or stale.
5. Prefer `pnpm exec wk` for Workspace Kit JSON output.
6. Run `pnpm exec wk run agent-bootstrap '{"projection":"lean"}'` to collect session context.
7. Run `pnpm exec wk doctor --json` to capture baseline health.
8. If local tools such as `pnpm`, Node, or `rg` are unavailable, stop claiming review evidence and record the blocker. Use fallback search only for exploration, not as proof that gates passed.

### 2. Freeze Review Scope

1. Record the current branch, base branch, merge base, and commit hash.
2. Identify whether the review is full baseline, phase cleanup, task-scoped cleanup, or PR update review.
3. If a `T###` task applies, read task context through Workspace Kit commands.
4. Do not transition task state unless the operator explicitly wants the review work represented in the task engine.
5. Define excluded paths and explain each exclusion.

### 3. Build The Coverage Ledger

1. Inventory all files outside excluded paths.
2. Bucket files by top-level area: `.ai`, `.workspace-kit`, `src`, `test`, `scripts`, `schemas`, `fixtures`, `extensions`, `.github`, `docs`, `examples`, `artifacts`, `.cursor`, root config, and tool folders.
3. Add ledger fields for path, bucket, owner/source, references, runtime exposure, tests, docs, status, recommendation, confidence, and evidence.
4. Allow group entries only for homogeneous generated or artifact sets where individual line review would not add useful signal.
5. Reconcile the ledger at the end so no file remains unclassified.

### 4. Map Public And Runtime Surfaces

1. List package exports, binaries, package `files`, scripts, and workspace packages from [package.json](package.json) and [pnpm-workspace.yaml](pnpm-workspace.yaml).
2. List Workspace Kit commands with `pnpm exec wk run --json`.
3. List module registrations and instruction entries under `src/modules`.
4. List Cursor extension activation events, commands, views, webviews, package files, media, and tests under `extensions/cursor-workflow-cannon`.
5. List CI entry points from `.github/workflows`.
6. Treat anything not reachable from these surfaces as an orphan candidate unless it is test-only, generated, or intentionally historical.

### 5. Map Architecture And Dependencies

1. Review [src/README.md](src/README.md) and [src/modules/README.md](src/modules/README.md).
2. Map `src/core`, `src/contracts`, `src/modules`, `src/cli`, `src/adapters`, and `src/ops`.
3. Check that modules depend only on `core` and `contracts` unless a documented facade exception exists.
4. Flag direct sibling-module imports, unclear facades, duplicated routing logic, and core files that now look module-owned.
5. Identify compatibility facades whose callers have disappeared.
6. Identify command or storage abstractions that are broader than current requirements.

### 6. Review Every Module

For each module under `src/modules`:

1. Review registration metadata, `dependsOn`, `optionalPeers`, capabilities, config, state schema, and `enabledByDefault` behavior.
2. Verify each instruction entry has a real file and each instruction file has a current purpose.
3. Compare command handlers with instruction contracts and tests.
4. Identify dead command options, stale aliases, unused config fields, duplicated helpers, and legacy migration branches.
5. Check whether persistence code belongs in the module, a shared core facade, or a narrower helper.
6. Classify module files as keep, refactor, compatibility, remove, generated, or needs decision.

Pay extra attention to these high-change areas:

- `task-engine`: task state, planning generation, transitions, dashboard, phase journal, wishlist, and compatibility paths.
- `context-activation`: registry surfaces, artifacts, traces, activation state, and generated guidance.
- `documentation`: generated source-of-truth flow and maintainer mirror drift.
- `improvement`: transcript/recommendation pipelines and policy-gated persistence.
- `plugins`, `skills`, `subagents`, and `team-execution`: discovery, storage, enablement, and orphaned command surfaces.

### 7. Review Task, Policy, And Storage Boundaries

1. Find all task lifecycle and policy approval paths.
2. Look for legacy JSON task-store assumptions now superseded by SQLite.
3. Identify duplicated planning-generation checks or parallel transition paths.
4. Check storage helpers for unclear ownership or public exposure beyond current users.
5. Separate true compatibility requirements from old implementation leftovers.
6. Never recommend direct task-store edits as a cleanup path.

### 8. Review Schemas, Contracts, And Fixtures

1. For each schema under `schemas`, identify producer, consumer, tests, versioning, and generated examples.
2. Flag schemas with no active reader or writer.
3. Flag duplicated contracts where TypeScript types, JSON Schema, fixtures, and docs have drifted.
4. Review fixtures for stale golden output, historical phase coupling, and unused scenario coverage.
5. Do not remove compatibility schemas without a migration or deprecation plan.

### 9. Review Scripts And Automation

Classify every script under `scripts` as one of:

- CI gate
- generator
- migration
- release tool
- smoke test
- advisory
- phase-specific historical tool
- local maintenance helper
- orphan candidate

Then:

1. Cross-check scripts referenced by [package.json](package.json), CI, docs, and tests.
2. Flag phase-specific or one-off scripts that should move to artifacts, be archived, or be deleted.
3. Identify duplicated validation logic that should become a Workspace Kit command or shared helper.
4. Check generated-output scripts for clear source and destination ownership.

### 10. Review Tests As Architecture Evidence

1. Map tests to source modules, commands, schemas, scripts, and extension surfaces.
2. Find tests preserving obsolete behavior.
3. Find tests whose names or fixtures reference old phase numbers or retired flows.
4. Find source areas with no corresponding test after behavior moved.
5. Keep tests for intentional compatibility paths, but record the removal condition.
6. Recommend test deletion only with a matching behavior removal or replacement.

### 11. Review Documentation And Source-Of-Truth Health

1. Treat `.ai` and module instruction files as canonical agent guidance where applicable.
2. Treat `docs/maintainers` as generated or maintainer-facing review targets unless a local instruction says otherwise.
3. Check for duplicated guidance, stale command names, old task-store references, and generated docs checked in without clear generation path.
4. Verify module behavior changes have matching canonical docs and generated mirrors where required.
5. Recommend regeneration through the documentation module or documented scripts rather than manual mirror edits.

### 12. Review Cursor Extension Surfaces

1. Map extension activation events, contributed commands, webview views, media, test files, and package `files` entries.
2. Identify commands or views no longer reachable from contributions.
3. Find stale chat prompts, duplicated render helpers, unused media, and tests for retired UI.
4. Check whether the extension remains a thin client over Workspace Kit or has accumulated business logic that belongs in the CLI or core package.
5. Confirm extension package metadata and root workspace scripts still match the extension's actual role.

### 13. Review CI, Packaging, Examples, And Artifacts

1. Review `.github/workflows` for gates that validate retired surfaces or miss current ones.
2. Review package `files` allowlists for stale inclusions and missing current runtime assets.
3. Review examples for commands, config, or package names that no longer represent current usage.
4. Classify artifacts as evidence, release output, stale generated output, or deletion candidates.
5. Inspect package dry-run contents before recommending package-surface cleanup.

### 14. Run Reachability And Drift Checks

Use multiple evidence sources before marking anything as orphaned:

1. Search by filename, command name, exported symbol, schema id, task id prefix, and instruction name.
2. Check TypeScript imports and package exports.
3. Check CLI command registration and module instruction entries.
4. Check scripts, CI, docs, tests, fixtures, and generated snippet indexes.
5. Check runtime command output when available.
6. Require at least two independent negative-reference checks before assigning `orphan-candidate`.

### 15. Rank Findings

Group recommendations into these categories:

- Immediate safe removals
- Staged deprecations
- Architecture refactors
- Module boundary cleanup
- Source-of-truth and generated-doc cleanup
- Test and fixture cleanup
- CI/package cleanup
- Investigation needed

Rank each finding by impact, confidence, compatibility risk, implementation effort, and validation cost.

### 16. Propose Cleanup Work

For each accepted finding, draft a cleanup task with:

- Scope
- Rationale
- Affected files and surfaces
- Acceptance criteria
- Compatibility or migration notes
- Validation commands
- Rollback plan

When persisting tasks, use Workspace Kit commands and include required policy approval fields when the command is policy-gated. Prefer dry-run/schema discovery first for unfamiliar task-engine commands.

### 17. Validate Recommendations

Run or request the relevant gates before calling a recommendation safe:

- `pnpm run build`
- `pnpm run check`
- `pnpm run test`
- `pnpm run maintainer-gates`
- `pnpm run pre-merge-gates`
- `pnpm run parity`
- `pnpm run pack:dry-run`
- `pnpm --filter cursor-workflow-cannon run check`
- `pnpm --filter cursor-workflow-cannon run compile`
- `pnpm --filter cursor-workflow-cannon run test`

Use targeted tests for focused recommendations. For deletion candidates, prefer a proof patch on a review branch: remove the candidate, run the relevant gates, and record results before claiming safe deletion.

### 18. Write The Final Report

The final report should start with the highest-value cleanup themes, then evidence.

Include:

- Review scope and excluded paths.
- Coverage ledger summary.
- Public/runtime surface summary.
- Prioritized refactor opportunities.
- Orphan candidates and confidence level.
- Legacy compatibility register.
- Proposed task list.
- Commands run and command blockers.
- Residual risks and human decisions needed.

Do not present uncertain orphan candidates as confirmed dead code. Use confidence levels and proof requirements.

## Finding Template

```md
### [Category] Short Finding Title

Current state:
What exists today.

Why this matters:
Why it adds architecture cost, legacy weight, duplication, drift, or future-change friction.

Evidence:
Files, symbols, command registrations, docs, tests, fixtures, or search results.

Recommendation:
Keep, refactor, consolidate, deprecate, archive, regenerate, or remove.

Risk:
Compatibility, release, task-state, docs, extension, or package impact.

Validation:
Commands, tests, proof patch, or maintainer decision needed before accepting the recommendation.
```

## Coverage Ledger Shape

```json
{
  "path": "src/modules/example/example.ts",
  "bucket": "src/modules/example",
  "surfaceType": "module-source",
  "references": ["src/modules/example/index.ts", "test/example.test.mjs"],
  "runtimeExposure": ["workspace-kit run example-command"],
  "canonicalSource": "src/modules/example/instructions/example-command.md",
  "tests": ["test/example.test.mjs"],
  "status": "active-refactor",
  "recommendation": "Consolidate duplicated option parsing with the module helper.",
  "confidence": "medium",
  "evidence": "Referenced by command registration and tests; duplicate parser found in two module files."
}
```

## Decision Rules

- Ask whether the code still deserves to exist in its current shape.
- Prefer removing dead surfaces over documenting them better.
- Prefer consolidating duplicated contracts into the canonical source rather than synchronizing copies by hand.
- Preserve compatibility intentionally; do not preserve legacy accidentally.
- Do not recommend broad rewrites when small, staged cleanup tasks would reduce risk.
- Do not delete generated mirrors without identifying the source and regeneration path.
- Do not delete tests before deciding whether the behavior they preserve should remain.
- Do not mutate task state, approval state, release state, or migration state outside Workspace Kit commands.
- Treat uncertain findings as investigation tasks, not cleanup tasks.

## Completion Criteria

The review is complete when:

1. Every in-scope file and runtime surface is classified.
2. Every orphan candidate has multi-source reference evidence.
3. Every legacy compatibility item has owner, contract, and removal condition where discoverable.
4. Every proposed removal has validation requirements.
5. Every proposed refactor has a bounded task shape.
6. Commands run and blockers are documented.
7. Human-decision items are separated from agent-actionable cleanup.

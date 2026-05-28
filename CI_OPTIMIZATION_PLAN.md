# CI Optimization Implementation Plan

**Artifact:** `CI_OPTIMIZATION_PLAN.md`  
**Status:** Materialized to task engine as Phase 118 ready work  
**Date:** 2026-05-28  
**Scope:** Implement CI recommendations 1-4: skip low-risk evidence/status changes, split PR CI by change type, remove duplicate build/test/pack work, and move full parity off ordinary `main` pushes.

## 1. Goal

Reduce needless GitHub Actions usage and waiting time while preserving release safety.

Success means:

- Evidence/status-only commits do not run expensive build/test/release/parity jobs.
- PR validation is selected from changed paths instead of running the same full surface for every change.
- Build/test/pack/parity work is not recomputed across `test`, `release-readiness`, `parity`, and `publish` jobs.
- Full release parity remains mandatory for shipping refs and publish, but no longer runs for ordinary low-risk `main` bookkeeping commits.
- Branch protection has one stable required CI result that passes whether validation jobs ran or were intentionally skipped.

## 2. Non-Goals

- Do not weaken release safety gates to go faster.
- Do not remove parity from release branches, tags, release dispatches, or publish eligibility.
- Do not hand-edit `.workspace-kit/tasks/workspace-kit.db`.
- Do not redesign the whole release process beyond the artifact reuse needed to eliminate duplicated CI work.
- Do not make publish depend on unreviewed local state.

## 3. Implementation Strategy

Deliver the change in four work packages matching the original recommendations.

### WP1 - Skip Evidence/Status-Only CI

Add path classification to `.github/workflows/ci.yml`. Introduce a lightweight `changes` job and a stable required `ci-result` aggregator. Evidence/status-only changes should make `ci-result` pass without starting expensive validation jobs.

Initial no-validation path set:

- `.workspace-kit/release-evidence/**`
- `artifacts/**`
- `output*.json`
- `run_status.json`
- `tasks_output.json`
- `ready_tasks.json`
- `full_tasks.json`
- `docs/maintainers/data/workspace-kit-status.db-export.yaml`

Decision: require a stable aggregator plus selected critical leaf jobs. The aggregator (`ci-result`) carries skip-aware pass/fail behavior, while critical leaf jobs remain required where they must always run for the selected change class.

Blocker: branch protection required checks must be confirmed before merging a workflow that can skip jobs. If branch protection currently requires `test` directly, change protection to require `ci-result` plus the agreed critical leaf jobs after the aggregator is in place.

### WP2 - Split PR CI by Change Type

Split validation so code, docs/governance, extension, and evidence/status changes run only their relevant checks. Add script-level check groups instead of one monolithic `pnpm run check` for every change.

Candidate groups:

- `check:code`: TypeScript, module boundaries, command manifests, runtime contract checks.
- `check:docs`: doc data, docs drift, maintainer canonical checks, generated docs consistency.
- `check:governance`: `.ai` source order, terms index, agent CLI snippets/map coverage, policy-sensitive command coverage.
- `check:extension`: Cursor extension check/compile.

Decision: use an aggressive path split. Maximize skip value by classifying checks into focused code, docs, governance, extension, and full/release groups, with review attention on any stage whose ownership is ambiguous.

Blocker: ownership of each existing `scripts/run-check-stages.mjs` stage must be classified before changing required PR gates. Misclassification could let a real drift escape.

### WP3 - Remove Duplicate Build/Test/Pack Work

Refactor CI so the repository is built once per run, the package is packed once, and downstream jobs consume artifacts instead of rebuilding/repacking. Refactor `scripts/run-parity.mjs` to support consuming a prebuilt tarball or running only the true package parity portion.

Decision: publish will find validated artifacts through the release evidence manifest rather than only through raw Actions artifact lookup. CI still uploads validated package artifacts with 30-day retention, and release evidence records the exact SHA/artifact identity publish must verify.

Blocker: parity currently shells out to `pnpm run build`, `pnpm run check`, `pnpm run test`, and `pnpm run pack:dry-run`. That script needs a compatibility-preserving option such as `--from-tarball <path>` or `PARITY_TARBALL_PATH` before the CI jobs can reuse artifacts safely.

### WP4 - Move Full Parity Off Ordinary Main Pushes

Update trigger/job policy so full release parity runs for shipping contexts only: `release/**`, tags, manual release-readiness dispatch, and publish eligibility. Ordinary `main` pushes should run only the changed-path-appropriate tier. Publish should verify that the exact SHA has a passing release-readiness/parity artifact before publishing.

Decision: approval for moving parity off ordinary `main` pushes will be recorded on the Phase 118 task record, with approver, date, and rationale. PR approval can supplement that record, but the task note is the canonical approval surface for this phase.

Blocker: release policy docs and branch protection expectations must be updated together. This touches release governance, so human approval is required before final merge.

## 4. Work Breakdown Structure

| WBS ID | Title | Depends On | Blockers | Done Means |
| --- | --- | --- | --- | --- |
| CI-1 | Inventory CI checks and branch protection | - | Need GitHub settings visibility for required checks. | Current workflows, required checks, expensive stages, and skip-safe paths are documented. |
| CI-2 | Add CI path classifier and aggregator | CI-1 | Branch protection must allow `ci-result` plus agreed critical leaf jobs. | `changes` and `ci-result` jobs exist; evidence/status-only changes pass without expensive jobs; branch protection mapping is documented. |
| CI-3 | Add grouped check scripts | CI-1 | Each existing check stage needs aggressive code/docs/governance/extension/full classification. | Package scripts expose focused check groups with tests covering the grouping metadata or stable output. |
| CI-4 | Wire PR jobs by change type | CI-2, CI-3 | Aggregator must handle skipped jobs correctly. | PRs run only code/docs/governance/extension jobs required by changed paths; aggregator reports pass/fail clearly. |
| CI-5 | Produce reusable build and pack artifacts | CI-2 | Artifact naming and retention must be deterministic by SHA/run and compatible with release evidence. | CI uploads build output or package tarball once with 30-day retention and downstream jobs download it. |
| CI-6 | Refactor parity to consume package artifact | CI-5 | Existing local `pnpm run parity` behavior must remain available. | Parity can run against a prebuilt tarball in CI and still support local all-in-one validation. |
| CI-7 | Refactor release-readiness to reuse artifacts | CI-5, CI-6 | Release diff base must still be available for push/release refs. | Release-readiness no longer rebuilds or repacks when a validated artifact exists. |
| CI-8 | Refactor publish to publish validated artifact | CI-6, CI-7 | Publish must verify exact-SHA release evidence manifest entries and 30-day artifact availability. | Publish workflow resolves the validated tarball from release evidence for the dispatch SHA before `npm publish`. |
| CI-9 | Restrict full parity to shipping contexts | CI-4, CI-6 | Human approval required because release gate policy changes; record it on the Phase 118 task note. | Ordinary `main` pushes skip full parity unless code/release context requires it; release refs still require parity. |
| CI-10 | Update CI/release docs and local task behavior | CI-4, CI-8, CI-9 | Docs must reflect final branch protection and publish behavior. | Maintainer docs, `.ai` release guidance, local automation notes, and phase/config/export drift cleanup match the new policy. |
| CI-11 | Validate end-to-end CI scenarios | CI-2, CI-4, CI-8, CI-9, CI-10 | Requires test PRs or workflow_dispatch runs for all six representative path sets. | Evidence/status, docs-only, extension-only, code, release branch, and publish scenarios have recorded run evidence. |

## 5. Task-Engine Batch Payload

Use this payload with `persist-planning-execution-drafts` after choosing the target phase and current `expectedPlanningGeneration`. Set `targetPhaseKey`, `targetPhase`, and `expectedPlanningGeneration` at invocation time.

Dependency note: the `dependsOn` fields below are intentionally omitted because task-engine dependencies must reference allocated task IDs, not WBS IDs. After task IDs are allocated, add dependencies using the WBS mapping in section 4:

- CI-2 depends on CI-1
- CI-3 depends on CI-1
- CI-4 depends on CI-2 and CI-3
- CI-5 depends on CI-2
- CI-6 depends on CI-5
- CI-7 depends on CI-5 and CI-6
- CI-8 depends on CI-6 and CI-7
- CI-9 depends on CI-4 and CI-6
- CI-10 depends on CI-4, CI-8, and CI-9
- CI-11 depends on CI-2, CI-4, CI-8, CI-9, and CI-10

```json
{
  "planRef": "planning:ci-optimization:2026-05-28",
  "planningType": "change",
  "desiredStatus": "proposed",
  "tasks": [
    {
      "title": "Inventory CI checks and protection",
      "type": "workspace-kit",
      "priority": "P1",
      "status": "proposed",
      "approach": "Document the current CI trigger matrix, required branch protection checks, recent expensive jobs, and skip-safe file classes before editing workflows.",
      "technicalScope": [
        ".github/workflows/ci.yml",
        ".github/workflows/publish-npm.yml",
        "package.json scripts",
        "GitHub branch protection settings",
        "recent GitHub Actions run history"
      ],
      "acceptanceCriteria": [
        "Current required checks are identified, including whether branch protection requires job names or a workflow-level aggregator.",
        "Recent CI and publish run timings are summarized with duplicated build/test/pack/parity work called out.",
        "Skip-safe evidence/status paths are listed with rationale and excluded from code-affecting categories.",
        "A migration note identifies any temporary branch protection change needed before skipped jobs can be introduced."
      ],
      "metadata": {
        "blockers": [
          "Requires GitHub settings visibility for required branch protection checks."
        ],
        "wbsId": "CI-1"
      }
    },
    {
      "title": "Add CI path classifier and aggregator",
      "type": "workspace-kit",
      "priority": "P1",
      "status": "proposed",
      "approach": "Add a `changes` classifier job and a stable `ci-result` aggregator in `.github/workflows/ci.yml` so skip decisions are explicit and branch protection can require one durable check.",
      "technicalScope": [
        ".github/workflows/ci.yml",
        "GitHub Actions path filtering",
        "branch protection required check strategy"
      ],
      "acceptanceCriteria": [
        "Evidence/status-only changes do not start expensive validation jobs.",
        "The aggregator succeeds when all required selected jobs pass or when no validation is required.",
        "The aggregator fails if any selected validation job fails or is cancelled unexpectedly.",
        "Skip decisions are visible in the workflow summary or job output."
      ],
      "metadata": {
        "blockers": [
          "Branch protection must be able to require the stable aggregator rather than skipped leaf jobs."
        ],
        "wbsId": "CI-2"
      }
    },
    {
      "title": "Add grouped check scripts",
      "type": "workspace-kit",
      "priority": "P1",
      "status": "proposed",
      "approach": "Refactor `scripts/run-check-stages.mjs` or add a companion script so existing checks can run by focused groups such as code, docs, governance, and extension.",
      "technicalScope": [
        "scripts/run-check-stages.mjs",
        "package.json scripts",
        "existing check scripts under scripts/"
      ],
      "acceptanceCriteria": [
        "`pnpm run check` keeps current all-stage behavior for local full validation.",
        "Focused scripts exist for code, docs, governance, and any other needed check groups.",
        "Each existing check stage is assigned to at least one group with no accidental omission.",
        "A local command proves each new group can run independently."
      ],
      "metadata": {
        "blockers": [
          "Maintainer must approve classification of mixed governance/doc/runtime checks before PR gating relies on it."
        ],
        "wbsId": "CI-3"
      }
    },
    {
      "title": "Wire PR jobs by change type",
      "type": "workspace-kit",
      "priority": "P1",
      "status": "proposed",
      "approach": "Split PR validation jobs in `ci.yml` so code, docs/governance, extension, and evidence/status path classes select only the relevant checks while reporting through the aggregator.",
      "technicalScope": [
        ".github/workflows/ci.yml",
        "package.json grouped check scripts",
        "Cursor extension workspace checks"
      ],
      "acceptanceCriteria": [
        "Code changes run build, code checks, unit tests, fixture smoke, and extension checks when shared surfaces require it.",
        "Docs/governance changes run only the relevant doc/governance groups.",
        "Extension-only changes run extension check/compile without unrelated root fixture tests unless shared code changed.",
        "Evidence/status-only changes produce only the classifier and aggregator result."
      ],
      "metadata": {
        "blockers": [
          "Aggregator behavior must be proven for skipped jobs before making leaf jobs optional."
        ],
        "wbsId": "CI-4"
      }
    },
    {
      "title": "Produce reusable build and pack artifacts",
      "type": "workspace-kit",
      "priority": "P1",
      "status": "proposed",
      "approach": "Change CI so the package tarball and any required build output are produced once per selected release-capable run and uploaded with deterministic artifact names tied to the SHA.",
      "technicalScope": [
        ".github/workflows/ci.yml",
        "pnpm run build",
        "pnpm run pack:dry-run",
        "artifacts/workspace-kit-pack"
      ],
      "acceptanceCriteria": [
        "The package tarball is created exactly once in the CI path that needs release/parity validation.",
        "Downstream jobs can download the tarball without rebuilding or repacking.",
        "Artifact names include enough SHA/run context to avoid consuming the wrong package.",
        "Retention is long enough for publish dispatch but not excessive."
      ],
      "metadata": {
        "blockers": [
          "Need agreement on artifact retention and naming convention for publish consumption."
        ],
        "wbsId": "CI-5"
      }
    },
    {
      "title": "Refactor parity to consume artifacts",
      "type": "workspace-kit",
      "priority": "P1",
      "status": "proposed",
      "approach": "Add a compatibility-preserving mode to `scripts/run-parity.mjs` that consumes a prebuilt tarball and runs only package parity and fixture smoke, while preserving local all-in-one parity behavior.",
      "technicalScope": [
        "scripts/run-parity.mjs",
        "test/fixtures/parity",
        "schemas/parity-evidence.schema.json",
        ".github/workflows/ci.yml"
      ],
      "acceptanceCriteria": [
        "Local `pnpm run parity` still runs the current full validation chain unless a tarball input is provided.",
        "CI parity can run against a downloaded tarball without invoking build, check, test, or pack again.",
        "Parity evidence records whether it used local full mode or prebuilt artifact mode.",
        "Failure output still identifies the failing parity step."
      ],
      "metadata": {
        "blockers": [
          "Parity evidence schema may need a backward-compatible field for artifact mode."
        ],
        "wbsId": "CI-6"
      }
    },
    {
      "title": "Refactor release-readiness artifact reuse",
      "type": "workspace-kit",
      "priority": "P1",
      "status": "proposed",
      "approach": "Update release-readiness so it reuses the build/package artifact and runs only release metadata, release diff allowlist, maintainer gates that still apply, and evidence upload.",
      "technicalScope": [
        ".github/workflows/ci.yml",
        "scripts/check-release-metadata.mjs",
        "scripts/check-release-diff-shape.mjs",
        "pnpm run maintainer-gates"
      ],
      "acceptanceCriteria": [
        "Release-readiness no longer performs duplicate build or pack work when an artifact exists.",
        "Release diff allowlist still receives the correct base SHA on push and release refs.",
        "Maintainer gates still run where they provide unique release assurance.",
        "Release-readiness evidence identifies the artifact SHA it validated."
      ],
      "metadata": {
        "blockers": [
          "Need to separate maintainer gates that truly require built `dist` from checks already completed in selected CI groups."
        ],
        "wbsId": "CI-7"
      }
    },
    {
      "title": "Publish validated package artifact",
      "type": "workspace-kit",
      "priority": "P1",
      "status": "proposed",
      "approach": "Refactor `publish-npm.yml` so publish verifies and uses the exact package artifact validated by release-readiness/parity instead of rebuilding, retesting, repacking, and reparity-checking.",
      "technicalScope": [
        ".github/workflows/publish-npm.yml",
        "scripts/trigger-publish-npm-workflow.mjs",
        "GitHub Actions artifacts or release evidence lookup",
        "npm publish tarball path"
      ],
      "acceptanceCriteria": [
        "Publish workflow refuses to publish if no passing release-readiness/parity evidence exists for the dispatch SHA.",
        "Publish downloads or otherwise resolves the exact validated tarball for that SHA.",
        "Publish no longer runs duplicate build, test, maintainer-gates, or parity steps except for a minimal integrity verification.",
        "The npm publish step publishes the validated tarball, not freshly built local runner output."
      ],
      "metadata": {
        "blockers": [
          "Requires policy decision on exact-SHA evidence lookup mechanism and artifact retention window.",
          "Requires NPM publish secret remains available only to the publish workflow."
        ],
        "wbsId": "CI-8"
      }
    },
    {
      "title": "Restrict full parity to shipping contexts",
      "type": "workspace-kit",
      "priority": "P1",
      "status": "proposed",
      "approach": "Change CI trigger/job conditions so full parity runs for release branches, tags, manual release-readiness/publish eligibility, and other shipping contexts rather than every ordinary `main` push.",
      "technicalScope": [
        ".github/workflows/ci.yml",
        ".github/workflows/publish-npm.yml",
        ".ai/RELEASING.md",
        "docs/maintainers release guidance"
      ],
      "acceptanceCriteria": [
        "Ordinary `main` pushes use the same changed-path tiering as PRs unless they are shipping-context changes.",
        "Release branches and publish eligibility still require full parity evidence.",
        "The workflow comments and docs describe the new tier policy accurately.",
        "The change has explicit human approval because it changes release gate policy."
      ],
      "metadata": {
        "blockers": [
          "Human approval required for release gate policy change.",
          "Branch protection and required checks must be updated in lockstep."
        ],
        "wbsId": "CI-9"
      }
    },
    {
      "title": "Update CI and release documentation",
      "type": "workspace-kit",
      "priority": "P2",
      "status": "proposed",
      "approach": "Update machine and maintainer guidance so agents and maintainers understand changed-path CI tiers, artifact reuse, publish eligibility, and local folder-open automation expectations.",
      "technicalScope": [
        ".ai/RELEASING.md",
        ".ai/CI-TIERS.md if present or new equivalent",
        "docs/maintainers release and CI runbooks",
        ".vscode/tasks.json local transcript sync note if retained"
      ],
      "acceptanceCriteria": [
        "Docs define which file classes trigger which CI tiers.",
        "Docs state publish uses a validated artifact for the exact SHA.",
        "Docs note how to run full local validation when CI skips low-risk changes.",
        "Local folder-open automation is either documented as intentional or changed in a separate follow-up if still noisy."
      ],
      "metadata": {
        "blockers": [
          "Final docs depend on the exact branch protection and artifact lookup decisions chosen in earlier tasks."
        ],
        "wbsId": "CI-10"
      }
    },
    {
      "title": "Validate CI optimization scenarios",
      "type": "workspace-kit",
      "priority": "P1",
      "status": "proposed",
      "approach": "Run or simulate representative workflow scenarios and record evidence that selected jobs match expectations and release safety gates remain intact.",
      "technicalScope": [
        "GitHub Actions workflow runs",
        "evidence/status-only change scenario",
        "docs-only change scenario",
        "extension-only change scenario",
        "code change scenario",
        "release branch scenario",
        "publish dispatch scenario"
      ],
      "acceptanceCriteria": [
        "Evidence/status-only scenario runs only classifier and aggregator.",
        "Docs-only and governance scenarios run their focused check groups and no code-only tests unless required by shared paths.",
        "Code scenario runs build/check/test and required smoke checks.",
        "Release scenario runs release-readiness and full parity against the reusable package artifact.",
        "Publish scenario proves exact-SHA validated artifact consumption or fails closed when evidence is absent.",
        "Run URLs or exported evidence are attached to the task notes or release evidence path."
      ],
      "metadata": {
        "blockers": [
          "Requires representative workflow runs on GitHub; local validation alone is insufficient for final acceptance."
        ],
        "wbsId": "CI-11"
      }
    }
  ]
}
```

## 6. Known Blockers Summary

- **Branch protection:** confirm required checks before introducing skipped leaf jobs. Prefer one stable required aggregator.
- **Check classification:** every existing `run-check-stages` stage needs a deliberate group assignment before PR tiering is trusted.
- **Parity script coupling:** `scripts/run-parity.mjs` currently recomputes build/check/test/pack; artifact reuse needs a new compatible mode.
- **Artifact retention and lookup:** publish needs a reliable exact-SHA tarball/evidence lookup with a retention window long enough for maintainer dispatch.
- **Release governance approval:** moving full parity off ordinary `main` pushes changes release gate policy and needs explicit human approval.
- **GitHub-only validation:** final proof requires representative Actions runs; local tests cannot fully prove skip/required-check behavior.

## 7. Recommended Execution Order

1. Complete CI-1 and confirm branch protection.
2. Land CI-2 with the aggregator while keeping existing jobs conservative.
3. Land CI-3 and CI-4 to reduce PR/main work by changed path.
4. Land CI-5, CI-6, and CI-7 to eliminate duplicate release/parity computation.
5. Land CI-8 after artifact lookup policy is approved.
6. Land CI-9 only after human approval of the release gate policy change.
7. Close with CI-10 and CI-11 evidence.

## 8. Materialization Record

Target phase selected: **Phase 118 - CI Optimization**.

Selection rationale: current canonical phase is Phase 117, which already has assigned ready work. Phase 118 was the next undelivered phase with no assigned tasks or phase notes, so it was cataloged and used for this plan.

Created proposed task mapping:

| WBS ID | Task ID | Title |
| --- | --- | --- |
| CI-1 | T100559 | Inventory CI checks and protection |
| CI-2 | T100560 | Add CI path classifier and aggregator |
| CI-3 | T100561 | Add grouped check scripts |
| CI-4 | T100562 | Wire PR jobs by change type |
| CI-5 | T100563 | Produce reusable build and pack artifacts |
| CI-6 | T100564 | Refactor parity to consume artifacts |
| CI-7 | T100565 | Refactor release-readiness artifact reuse |
| CI-8 | T100566 | Publish validated package artifact |
| CI-9 | T100567 | Restrict full parity to shipping contexts |
| CI-10 | T100568 | Update CI and release documentation |
| CI-11 | T100569 | Validate CI optimization scenarios |

Dependency edges were applied using allocated task IDs. Final verification evidence was captured under `artifacts/ci-plan-*`; canonical task-state verification passed with zero findings after the dependency recovery publish and hydrate.

## 9. Finish Review

The implementation plan is complete enough to execute. The remaining finish items now have selected decisions:

- **Branch protection:** implement `ci-result` as the skip-aware aggregator and keep agreed critical leaf jobs required.
- **Check grouping:** use an aggressive path split across code, docs, governance, extension, and full/release checks.
- **Artifact lookup:** publish verifies exact-SHA release evidence manifest entries and resolves the validated package artifact from that evidence.
- **Artifact retention:** retain validated package artifacts for 30 days.
- **Parity policy approval:** record approver/date/rationale on the Phase 118 task note for CI-9 before merging the release-gate change.
- **Validation scenarios:** require all six live scenarios: evidence/status-only, docs-only, extension-only, code, release branch, and publish dispatch.
- **Docs and drift:** handle release/CI guidance and current phase/config/export drift cleanup inside CI-10 rather than opening a separate drift task.

## 10. Decision Record

| Topic | Decision | Applies To |
| --- | --- | --- |
| Branch protection | Require `ci-result` plus agreed critical leaf jobs. | CI-1, CI-2, CI-4, CI-11 |
| Check grouping | Use aggressive path splitting for maximum skip value. | CI-3, CI-4 |
| Publish artifact lookup | Use release evidence manifest entries as the exact-SHA source of truth. | CI-5, CI-7, CI-8 |
| Artifact retention | Keep validated package artifacts for 30 days. | CI-5, CI-8 |
| Parity policy approval | Record approval on the Phase 118 task note. | CI-9 |
| Validation coverage | Run all six representative GitHub Actions scenarios. | CI-11 |
| Docs and drift | Keep docs and phase/config/export drift cleanup in CI-10. | CI-10 |

## 11. Ready Review Decisions

These decisions were captured before accepting the Phase 118 tasks as ready:

| WBS ID | Task ID | Ready decision |
| --- | --- | --- |
| CI-1 | T100559 | Branch-protection evidence should be gathered from `gh`/GitHub API output only, avoiding UI-only evidence. |
| CI-2 | T100560 | Required checks should be `ci-result` plus `test` and release leaf checks on shipping contexts. |
| CI-3 | T100561 | Ambiguous checks in the aggressive path split default to the full/release group. |
| CI-4 | T100562 | Mixed path changes should run the union of all matching check groups. |
| CI-5 | T100563 | Reusable artifact identity should combine commit SHA and package version. |
| CI-6 | T100564 | Local `pnpm run parity` keeps the full validation chain by default; artifact mode is opt-in for CI. |
| CI-7 | T100565 | Release-readiness should keep the current surface minus duplicate pack/build work. |
| CI-8 | T100566 | Publish should trigger release-readiness and stop if exact-SHA release evidence is missing or stale. |
| CI-9 | T100567 | Parity policy approval must come from a maintainer and be recorded on the task note. |
| CI-10 | T100568 | CI-10 updates machine docs, maintainer docs, and workspace status export/drift cleanup. |
| CI-11 | T100569 | Each validation scenario requires the GitHub Actions run URL plus a job summary of selected/skipped jobs. |

## 12. Ready Acceptance Record

All Phase 118 CI optimization tasks were accepted from `proposed` to `ready` after the ready-review decisions above were recorded on each task.

Acceptance details:

- Accepted tasks: T100559, T100560, T100561, T100562, T100563, T100564, T100565, T100566, T100567, T100568, T100569.
- Acceptance rationale: `accept Phase 118 CI optimization tasks as ready after user ready-review decisions`.
- Final planning generation observed after acceptance: `4248`.
- Canonical task-state verification passed with zero findings after acceptance.
- Queue health marks these as future-phase ready work because canonical current phase remains Phase 117.
- T100559 is unblocked and first in the Phase 118 dependency chain; the remaining ready tasks retain unmet dependency relationships until their prerequisite tasks complete.
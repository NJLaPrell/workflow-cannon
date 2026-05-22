# Workflow Cannon 1.0 Release Prep Plan

This plan defines the high-level gates and workstreams needed before the Workflow Cannon 1.0 release.

The central release goal is:

> Workflow Cannon, installed through Workflow Kit and operated through the Dashboard UI Plugin, gives another project a safe, inspectable AI workflow operating layer with durable task state, policy-gated actions, project-safe agent guidance, and release-quality evidence.

The most important 1.0 criterion is that Workflow Kit can be attached to another project and bring everything needed for Workflow Cannon to work, while not importing Workflow Cannon's own internal development directives, maintainer runbooks, roadmap process, or repository-specific agent rules into the consumer project.

## 1. Product Boundary Gate

Define exactly what Workflow Cannon 1.0 means.

This gate should answer:

- What is stable in 1.0?
- What is preview or experimental?
- What does the Dashboard UI Plugin own?
- What does the CLI own?
- What does `wk init` create?
- What does the package include but not expose?
- What is intentionally not part of 1.0?

The output should be a short stability or contract document, such as `STABILITY.md` or `docs/1.0-contract.md`.

## 2. Consumer Package Boundary Gate

Verify that `@workflow-cannon/workspace-kit` includes everything needed for another project to use Workflow Cannon, but does not carry Workflow Cannon's internal development brain into that project.

High-level work:

- Audit published package contents.
- Classify files as runtime, consumer guidance, templates, fixtures, internal docs, or release-only assets.
- Remove or quarantine internal maintainer docs, rules, and runbooks from the package.
- Ensure `wk init` only writes consumer-safe guidance.
- Add a package-content test that fails if internal-only paths are included.
- Add a consumer-init test that fails if internal Workflow Cannon directives are generated into another project.

The key test should be:

> Install the packed package into a clean fake project, run init, then verify no internal Workflow Cannon maintainer/development instructions are present or referenced.

## 3. Dashboard UI Plugin 1.0 Gate

The Dashboard UI Plugin is a flagship 1.0 feature and must be treated as a first-class release artifact.

High-level work:

- Define the Dashboard UI Plugin as a core 1.0 surface.
- Define plugin-to-Workflow-Kit compatibility rules.
- Decide distribution path: marketplace, packaged VSIX, repo release artifact, or documented local install.
- Verify plugin works against a consumer project, not just the Workflow Cannon repository.
- Make plugin failure modes clear: missing kit, stale state, wrong Node, bad config, missing task DB.
- Add plugin smoke or E2E validation to release gates.
- Ensure old `dashboard-summary` language is either renamed as a backend contract or removed from user-facing docs.

The Dashboard should feel like the normal way humans use Workflow Cannon, not like a UI sitting on top of a CLI experiment.

## 4. First-Run Experience Gate

Make the attached-project experience boring and repeatable.

High-level work:

- Validate clean install.
- Validate attach to existing repo.
- Validate attach to dirty repo.
- Validate attach to monorepo.
- Validate wrong Node version behavior.
- Validate missing pnpm/npm edge cases.
- Validate no Git repo behavior.
- Validate re-running `wk init`.
- Validate `wk doctor` gives useful remediation.
- Validate Dashboard opens and displays useful state after init.

The core release transcript should be:

```bash
npm install -D @workflow-cannon/workspace-kit
npx wk init --yes --approval-rationale "bootstrap Workflow Cannon"
npx wk doctor
npx wk start
```

Then open the Dashboard UI Plugin and verify it sees the project.

## 5. Agent Guidance Safety Gate

Separate package contents from agent guidance safety.

Even if the package includes runtime files, agents operating in consumer projects must receive only consumer-safe instructions.

High-level work:

- Separate internal development directives from consumer operation directives.
- Ensure generated consumer `AGENTS.md` or equivalent does not point to Workflow Cannon maintainer docs.
- Ensure consumer agent instructions explain how to use project-local `.workspace-kit` state.
- Ensure policy approval language is preserved.
- Ensure internal release trains, phase closeout processes, roadmap generation rules, maintainer gates, and Workflow Cannon repo-specific task procedures are not applied to consumer projects.
- Add a generated-guidance snapshot test.

Conceptual boundary:

| Context | Agent should follow |
| --- | --- |
| Developing Workflow Cannon itself | Internal `.ai`, maintainer docs, release/runbook rules |
| Using Workflow Cannon in another project | Consumer-safe generated guidance and project-local state |
| Runtime package internals | Not treated as project operating instructions |

## 6. Version and Release Truth Gate

All public truth surfaces must agree before 1.0.

High-level work:

- Align `package.json`.
- Align README.
- Align maintainer roadmap.
- Align changelog.
- Align status YAML.
- Align GitHub release metadata.
- Align npm version metadata.
- Align Dashboard UI Plugin version.
- Align compatibility matrix.
- Define one canonical release metadata source.
- Generate or validate all public release docs from it.
- Add a CI check that fails on version/status mismatch.
- Decide whether plugin version tracks package version or uses compatibility ranges.

## 7. Stable Contract Gate

Define what consumers can safely rely on after 1.0.

High-level stable contracts should include:

- CLI entrypoints: `wk`, `workspace-kit`.
- Core commands: `init`, `doctor`, `start`.
- Core run commands: task listing, next actions, transitions, policy approval.
- Generated consumer files.
- Task persistence expectations.
- Config keys needed for normal operation.
- Dashboard plugin backend contracts.
- Error and remediation shape.
- Migration guarantees.
- Package exports that are intentionally public.

Everything else should be explicitly marked preview, internal, or unsupported.

## 8. Migration and Upgrade Gate

1.0 needs to handle both new users and existing users.

High-level work:

- Verify upgrade from current pre-1.0 project state.
- Verify migration from older `.workspace-kit` structures.
- Verify doctor detects stale state.
- Verify migrations do not overwrite project-owned files.
- Verify generated guidance can be updated safely.
- Verify Dashboard UI Plugin handles older state with useful remediation.
- Document rollback and recovery.

This does not need to support every ancient state forever, but it needs a clear policy.

## 9. CI / Release Evidence Gate

Existing CI should be extended with consumer-facing evidence.

Add release gates for:

- Packed package install in a fresh temp project.
- `wk init`, `wk doctor`, and `wk start` smoke tests.
- Package-content audit.
- Generated-guidance audit.
- Dashboard UI Plugin connection to temp project.
- Plugin/package compatibility check.
- Version truth consistency.
- Migration fixture test.
- Parity evidence from installed package, not repo-local source.

The evidence bundle should be generated or attached to the release.

## 10. Documentation Gate

Rearrange docs around the 1.0 user journey.

High-level work:

- Rewrite README as a product and quickstart page.
- Add a "what gets installed / generated" section.
- Add a "what does not get imported into your project" section.
- Promote Dashboard UI Plugin as the primary human surface.
- Move internal maintainer process out of the public front door.
- Add consumer install docs.
- Add Dashboard install docs.
- Add troubleshooting docs.
- Add stability and compatibility docs.
- Ensure old `dashboard-summary` references do not confuse the user-facing story.

## 11. Security / Trust Gate

Workflow Cannon operates inside real repositories and gives agents workflow power, so trust boundaries must be explicit.

High-level work:

- Review policy-gated mutation paths.
- Confirm approvals cannot be satisfied by vague chat text.
- Confirm sensitive operations have clear operation IDs.
- Confirm generated consumer guidance preserves approval boundaries.
- Confirm package does not include secrets, private evidence, local artifacts, or internal-only state.
- Confirm Dashboard UI Plugin does not execute unexpected commands.
- Confirm logs do not leak policy approval payloads, tokens, or local paths unnecessarily.
- Confirm install/init behavior is safe by default.

## 12. Distribution Gate

Users need a clean way to get the whole system.

High-level decisions:

- How is Workflow Kit installed?
- How is Dashboard UI Plugin installed?
- Is the plugin distributed through a marketplace, release artifact, or manual dev install?
- Are package and plugin released together?
- How is compatibility communicated?
- What does a user do after npm install?
- What does a user do after opening Cursor or VS Code?

This gate is especially important because the Dashboard UI Plugin is a major 1.0 feature.

## High-Level Punchlist

| Priority | Workstream | Goal |
| --- | --- | --- |
| P0 | 1.0 Product Contract | Define stable 1.0 scope, preview areas, and user promise |
| P0 | Package Boundary Audit | Ensure package includes needed runtime assets but excludes or quarantines internal directives |
| P0 | Consumer Guidance Split | Separate Workflow Cannon internal agent rules from generated consumer-project rules |
| P0 | Dashboard UI Plugin Readiness | Treat plugin as a flagship 1.0 artifact with compatibility, distribution, and validation |
| P0 | Consumer Install Validation | Prove clean project attach/init/doctor/start/plugin flow from packed package |
| P0 | Version Truth Cleanup | Align package, docs, roadmap, changelog, status, npm, GitHub releases, and plugin versioning |
| P1 | Stable API/Contract Matrix | Document stable CLI, config, task, plugin, policy, migration, and generated-file surfaces |
| P1 | Migration / Upgrade Path | Verify existing project upgrades and state migrations before 1.0 |
| P1 | Release Evidence Bundle | Produce install, package, dashboard, migration, policy, and version evidence for 1.0 |
| P1 | Documentation Restructure | Rewrite public docs around installed-project and Dashboard workflow |
| P1 | Security / Trust Review | Validate approval gates, package safety, plugin command behavior, and log hygiene |
| P2 | Advanced Feature Labeling | Mark CAE, subagents, team execution, skills/plugins, transcripts, and similar systems as stable, preview, or internal |
| P2 | Release Distribution Polish | Finalize npm/plugin release path and compatibility communication |

## Consumer Confusion Test

Add a release test that captures the most dangerous 1.0 failure mode.

After installing Workflow Cannon into a fake project, ask an agent:

> What instructions should you follow in this repo?

The expected answer should reference only the consumer project's generated Workflow Cannon guidance and local `.workspace-kit` state. It must not reference Workflow Cannon's own internal roadmap, release phase docs, maintainer runbooks, package development rules, or repository-specific agent instructions.

## 1.0 Readiness Standard

Workflow Cannon is ready for 1.0 when this is true:

> A user can attach Workflow Kit to a non-Workflow-Cannon project, open the Dashboard UI Plugin, run a governed agent workflow, persist task and evidence state, and never expose the consumer project's agent to Workflow Cannon's own internal development directives.

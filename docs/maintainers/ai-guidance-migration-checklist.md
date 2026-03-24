# AI Guidance Migration Checklist

Audit baseline: source-repository freeze commit `65797d888629d017f3538bd793c5e7cd781edf7d`.

Goal: verify that AI-agent behavior surfaces from the source baseline were migrated into `workflow-cannon`.

## Scope used for parity

- `.cursor/commands/*`
- `.cursor/rules/*`
- `docs/policies/*`
- `docs/workflows/*`
- `tasks/*`
- `.workspace-kit/*` files used for agent/profile-driven context
- `workspace-kit.profile.json`

## Result summary

- Migrated: 27 items
- Intentionally not migrated as-is (state/generated logs): 4 items
- Missing required behavior files: 0

## Migrated files

- `.cursor/commands/discover-tasks.md`
- `.cursor/commands/prepare-release.md`
- `.cursor/commands/qt.md`
- `.cursor/rules/branching-tagging-strategy.mdc`
- `.cursor/rules/git-commit-strategy.mdc`
- `.cursor/rules/github-mcp-preference.mdc`
- `.cursor/rules/phase-kickoff-assessment.mdc`
- `.cursor/rules/pr-review-merge-strategy.mdc`
- `.cursor/rules/pre-release-readiness.mdc`
- `.cursor/rules/release-strategy.mdc`
- `.cursor/rules/task-completion-workflow.mdc`
- `.cursor/rules/task-discovery-workflow.mdc`
- `.cursor/rules/task-pr-delivery-loop.mdc`
- `.cursor/rules/workspace-kit-agent.mdc`
- `.cursor/rules/workspace-kit-workflow-contract.mdc`
- `docs/policies/branching-tagging-strategy.md`
- `docs/policies/commit-strategy.md`
- `docs/policies/pr-review-merge-strategy.md`
- `docs/workflows/task-pr-delivery-workflow.md`
- `tasks/incident-triage.md`
- `tasks/pr-review.md`
- `tasks/release-notes.md`
- `tasks/research.md`
- `tasks/standup.md`
- `tasks/test.md`
- `.workspace-kit/manifest.json`
- `.workspace-kit/owned-paths.json`
- `workspace-kit.profile.json`

## Intentionally not migrated as-is

These are runtime/generated state artifacts and should be regenerated in this repository instead of copied verbatim:

- `.workspace-kit/generated/improvement-summary.json`
- `.workspace-kit/generated/workflow-contract-summary.json`
- `.workspace-kit/improvement-log.json`
- `.workspace-kit/workflow-contract.json`

## Added in Workflow Cannon (new, expected)

These were added to support profile-driven context for this split repository:

- `.cursor/rules/workspace-kit-profile-pointer.mdc`
- `.cursor/rules/workspace-kit-project-context.mdc`
- `.workspace-kit/generated/project-context.json`
- `schemas/workspace-kit-profile.schema.json`
- `tasks/generate-doc.md` (project-specific task template)

## Notes

- `docs/maintainers/AGENTS.md` and `.cursorrules` were not present in the source baseline and are not required for parity.
- Core AI behavior surfaces are now present in-repo and can be referenced by `docs/maintainers/TERMS.md`, `README.md`, and release/task workflows.

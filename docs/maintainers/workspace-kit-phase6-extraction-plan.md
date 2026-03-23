# Workspace Kit Phase 6 extraction plan

This document is the maintainer source of truth for Phase 6 extraction execution and closeout evidence.

## Scope

- Extract the publishable workspace-kit package into this dedicated repository.
- Keep QuickTask as an external consumer and regression fixture.
- Preserve release independence between Workflow Cannon package releases and QuickTask releases.

## Chosen approach

- Project/repo identity: Workflow Cannon (`workflow-cannon`).
- Package identity: `@workflow-cannon/workspace-kit`.
- Repository shape: single-package extracted repository first.
- History strategy: `git subtree split` from `packages/workspace-kit` to preserve package history without unrelated monorepo history.
- Cutover policy: use a pre-split freeze commit in QuickTask, then treat this repository as package home.

## Execution sequence

1. Confirm pre-cut gates (`upgrade`, `init`, `check`, `doctor`) and release-cycle evidence.
2. Capture pre-split freeze commit SHA from QuickTask.
3. Run `git subtree split --prefix packages/workspace-kit -b workflow-cannon-split`.
4. Push split branch into this repository as default history base.
5. Configure release automation in this repository.
6. Publish package and verify consumer installability.

## Human-only gates

- Repository creation and org-level permissions.
- Registry org ownership and publish secrets.

## Completion evidence snapshot

- Pre-split freeze commit in QuickTask: `65797d888629d017f3538bd793c5e7cd781edf7d`
- Subtree split branch: `workflow-cannon-split`
- Split commit SHA: `5a1f7038255a2c83e0e51ace07ea0d95a327574c`
- Publish workflow success: `https://github.com/NJLaPrell/workflow-cannon/actions/runs/23463225397`
- npm package published: [`@workflow-cannon/workspace-kit`](https://www.npmjs.com/package/@workflow-cannon/workspace-kit) (`latest` = `0.1.0`)

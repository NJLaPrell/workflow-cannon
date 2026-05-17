<!-- GENERATED FROM .ai/runbooks/install-attach-workflow-cannon.md — edit that file; do not hand-edit this render (see docs/maintainers/adrs/ADR-ai-canonical-maintainer-docs-pipeline.md) -->

# Install and attach Workflow Cannon

Use this runbook when attaching `@workflow-cannon/workspace-kit` to an existing repository or repairing a partial first-run install.

## First Run

From the target repository root:

```bash
pnpm add -D @workflow-cannon/workspace-kit
pnpm exec wk init
pnpm exec wk start
pnpm exec wk run get-next-actions '{}'
```

`wk init` is the first setup command. It detects project metadata, creates the Workflow Cannon baseline files, initializes task persistence, optionally creates a starter task, and runs doctor validation at the end. Use `wk doctor` after init or during repair checks; it is read-only and does not attach a workspace by itself.

## Ownership

Workflow Cannon writes only kit-owned baselines and generated context. The ownership policy lives at `.workspace-kit/owned-paths.json`, and the install manifest points at that policy.

`workspace-kit.profile.json` is merge-managed: init creates it when missing but preserves an existing valid profile on re-init. Generated kit-owned files are refreshed from the profile; unknown user files are not deleted by init, refresh, upgrade, or detach.

## SQLite

The default task store is SQLite at `.workspace-kit/tasks/workspace-kit.db`. Init prepares the planning database through the same core database path used by runtime commands, including the empty-store case when `--no-starter-task` skips starter creation.

## Runtime Contract

Workflow Cannon runtime execution is governed by `.ai/adrs/ADR-workflow-cannon-runtime-contract-v1.md`. Attached workspaces use a kit-owned Node 22 runtime stamp at `.workspace-kit/runtime.json` and a canonical launcher at `.workspace-kit/bin/wk`.

After attach, routine Workflow Cannon commands should use the stamped runtime/launcher. They should not depend on shell `PATH`, editor/Electron Node, or attached project `.nvmrc` / `.node-version` files.

After attach, these commands should work:

```bash
pnpm exec wk doctor
pnpm exec wk start --json
pnpm exec wk run dashboard-summary '{}'
```

## Starter Task

By default, init creates one starter task that asks the maintainer to validate Workflow Cannon onboarding. Re-running init should not create a duplicate starter task.

To skip starter task creation in automation or fixture setup:

```bash
pnpm exec wk init --yes --approval-rationale "attach without starter task" --no-starter-task
```

## Repair, Force, And Dry Run

Preview planned writes without changing disk:

```bash
pnpm exec wk init --dry-run
pnpm exec wk init --dry-run --json
```

Repair missing baseline files by re-running init. When a kit-owned generated file has drifted and should be refreshed, use `--force`; init writes backups before replacing changed kit-owned content.

```bash
pnpm exec wk init --yes --approval-rationale "repair Workflow Cannon baselines" --force
```

`wk detach --dry-run` previews owned paths only. In this release, non-dry-run detach is intentionally preview-only and does not delete files.

## Approvals

Interactive local init may ask for a TTY confirmation. Non-interactive init requires one of:

```bash
pnpm exec wk init --yes --approval-rationale "attach Workflow Cannon"
```

or:

```bash
export WORKSPACE_KIT_POLICY_APPROVAL='{"confirmed":true,"rationale":"attach Workflow Cannon"}'
pnpm exec wk init
```

Sensitive `workspace-kit run` commands use JSON `policyApproval` inside the run argument object instead of the env lane. Do not treat chat text, dashboard prompts, or issue comments as policy approval.

## Native SQLite

If doctor reports a native SQLite load failure, first confirm the active Node runtime matches the stamped Workflow Cannon runtime. On Apple Silicon, avoid mixing arm64 installs with Rosetta x64 Node.

Use the native recovery runbook for rebuild steps and fallback choices: [`native-sqlite-consumer-install.md`](./native-sqlite-consumer-install.md).

## Refresh Context

Use `wk refresh-context` after editing `workspace-kit.profile.json`. It regenerates profile-derived artifacts only:

- `.workspace-kit/generated/project-context.json`
- `.cursor/rules/workspace-kit-project-context.mdc`

`refresh-context` is not the first-run attach command; use `wk init` for attach or repair.

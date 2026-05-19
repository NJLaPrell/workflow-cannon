<!--
agentCapsule|v=1|command=install-git-hooks|module=task-engine|schema_only=pnpm exec wk run install-git-hooks --schema-only '{}'
-->

# install-git-hooks

Install opt-in git **pre-push** and **pre-commit** hooks under `.workspace-kit/git-hooks` and set `core.hooksPath` to that directory.

## Usage

```
pnpm exec wk run install-git-hooks '{"policyApproval":{"confirmed":true,"rationale":"enable destructive git guard"}}'
```

## Behavior

- **pre-push:** blocks force / rewritten pushes to `main`, `master`, and `release/phase-*` without approval.
- **pre-commit:** blocks direct commits on those protected branches without approval.
- Approval surfaces: `WORKSPACE_KIT_POLICY_APPROVAL` JSON env, or `.workspace-kit/policy/git-destructive-approval.json` with `{ "confirmed": true, "rationale": "…", "expiresAt": "…" }` (optional expiry).

## Opt out

```
pnpm exec wk run uninstall-git-hooks '{"policyApproval":{"confirmed":true,"rationale":"remove hooks"}}'
```

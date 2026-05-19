<!--
agentCapsule|v=1|command=uninstall-git-hooks|module=task-engine|schema_only=pnpm exec wk run uninstall-git-hooks --schema-only '{}'
-->

# uninstall-git-hooks

Remove workspace-kit git policy hooks and clear `core.hooksPath` when it points at `.workspace-kit/git-hooks`.

## Usage

```
pnpm exec wk run uninstall-git-hooks '{"policyApproval":{"confirmed":true,"rationale":"remove git policy hooks"}}'
```

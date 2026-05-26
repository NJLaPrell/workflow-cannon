agentCapsule|v=1|command=check-task-store-commit|module=task-engine|schema_only=pnpm exec wk run check-task-store-commit --schema-only '{}'

# check-task-store-commit

Read-only guardrail: fail when the **live** planning SQLite file (or `.db-wal` / `.db-shm` under `.workspace-kit/tasks/`) is **staged** for commit without an explicit approval marker.

## Usage

```bash
pnpm exec wk run check-task-store-commit '{}'
```

## Approval (recovery / migration only)

Write `.workspace-kit/policy/task-store-sqlite-commit-approval.json`:

```json
{"confirmed":true,"rationale":"documented recovery commit"}
```

Optional `expiresAt` ISO timestamp. One-shot env: `WORKSPACE_KIT_TASK_STORE_COMMIT_APPROVAL='{"confirmed":true,"rationale":"…"}'`.

Also enforced by `workspace-kit doctor` (fails when staged) and opt-in **pre-commit** hooks from `install-git-hooks`.

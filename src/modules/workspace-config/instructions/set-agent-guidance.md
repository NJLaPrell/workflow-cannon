<!--
agentCapsule|v=1|command=set-agent-guidance|module=workspace-config|schema_only=pnpm exec wk run set-agent-guidance --schema-only '{}'
-->

# set-agent-guidance

Persist **agent guidance tier** (RPG party v1) under `kit.agentGuidance` in `.workspace-kit/config.json`.

## Non-interactive

```bash
workspace-kit run set-agent-guidance '{"tier":3}'
```

Optional: `interactive: true` prints numbered choices and reads one line from stdin (TTY).

## Idempotency

Re-running with the same tier overwrites the same keys — no duplicate structures.

Changing the tier can change derived **agent presentation policy**. `set-agent-guidance` schedules best-effort sync of `.cursor/rules/workflow-cannon-effective-agent-behavior.mdc`; run `resolve-agent-guidance` or `sync-effective-behavior-cursor-rule '{"dryRun":true}'` to inspect the effective result.

## Policy

Uses the **`workspace-kit run`** lane. This command is **non-sensitive** in the builtin manifest (same class as `set-active-behavior-profile`); **`config set`** on `kit.agentGuidance.*` keys still requires **`WORKSPACE_KIT_POLICY_APPROVAL`** when using the `config` CLI (see `docs/maintainers/POLICY-APPROVAL.md`).

## See also

- `resolve-agent-guidance` — read effective tier without persisting
- `.ai/runbooks/agent-presentation-policy.md` — baseline presentation config and CAE scoped override patterns
- `docs/maintainers/runbooks/agent-guidance-onboarding.md`

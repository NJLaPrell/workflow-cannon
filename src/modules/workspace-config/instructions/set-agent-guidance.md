# set-agent-guidance

Persist **agent guidance tier** (RPG party v1) under `kit.agentGuidance` in `.workspace-kit/config.json`.

## Non-interactive

```bash
workspace-kit run set-agent-guidance '{"tier":3}'
```

Optional: `interactive: true` prints numbered choices and reads one line from stdin (TTY).

## Idempotency

Re-running with the same tier overwrites the same keys — no duplicate structures.

## Policy

Uses the **`workspace-kit run`** lane. This command is **non-sensitive** in the builtin manifest (same class as `set-active-behavior-profile`); **`config set`** on `kit.agentGuidance.*` keys still requires **`WORKSPACE_KIT_POLICY_APPROVAL`** when using the `config` CLI (see `docs/maintainers/POLICY-APPROVAL.md`).

## See also

- `resolve-agent-guidance` — read effective tier without persisting
- `docs/maintainers/runbooks/agent-guidance-onboarding.md`

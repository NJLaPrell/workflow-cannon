# Long-session reload (agents)

When context may be stale:

1. Re-read `.ai/PRINCIPLES.md` and `.ai/WORKSPACE-KIT-SESSION.md`.
2. Run `pnpm run wk doctor` and `pnpm run wk -- run get-next-actions '{}'`.
3. Refresh queue facts with `list-tasks` / `get-task`—do not trust chat memory for task `status` or phase.

Maintainer narrative (optional for humans): `docs/maintainers/runbooks/cursor-long-session.md`.

# Cursor / VS Code transcript automation

## Package scripts (T271)

- `pnpm run transcript:sync` — runs `workspace-kit run sync-transcripts '{}'` via `scripts/run-transcript-cli.mjs`. **Fails fast** if `dist/cli.js` is missing; run `pnpm run build` first.
- `pnpm run transcript:ingest` — runs `ingest-transcripts` with `{}` JSON args. **Policy-sensitive:** set `WORKSPACE_KIT_POLICY_APPROVAL` (JSON) or pass approval through interactive `workspace-kit run` flows; see `docs/maintainers/runbooks/transcript-ingestion-operations.md`.

## Folder-open behavior (T272)

`.vscode/tasks.json` includes:

- **transcript:sync (folder open)** — `runOn: folderOpen`, background, no problem matcher. Copy-first sync only; avoids policy prompts on every open.
- **transcript:ingest (manual)** — run explicitly when you want cadence-gated ingest; same policy rules as CLI.

VS Code-compatible; Cursor follows the same task model. If a client ignores `runOn`, run `transcript:sync` manually.

## Limitations

Folder-open tasks run when the workspace loads, **not** on a wall-clock schedule. Use OS schedulers or CI for periodic runs; see `docs/maintainers/workbooks/transcript-automation-baseline.md`.

## Config cross-links

- `improvement.transcripts.*`, `improvement.cadence.*` — `docs/maintainers/CONFIG.md` / `.ai/CONFIG.md` after `config generate-docs`.

## Privacy / git

Keep local transcript archives out of version control if they may contain sensitive content; default archive path `agent-transcripts/` is often gitignored in consumer repos (project policy).

## Post-completion hook (T274)

`improvement.hooks.afterTaskCompleted`: `off` (default), `sync`, or `ingest` (ingest requires `WORKSPACE_KIT_POLICY_APPROVAL` in the environment of the process running `workspace-kit`, or the hook falls back to sync). Spawns a **detached** child so `run-transition` returns immediately.

Hook observability and overlap controls:

- Lock file: `.workspace-kit/improvement/transcript-hook.lock` prevents unsafe overlap (`skip-if-busy` behavior).
- Status evidence log: `.workspace-kit/improvement/transcript-hook-events.jsonl` records `started`, `completed`, `failed`, and `skipped` events with reasons (for example `lock-busy` or `cli-not-found`).

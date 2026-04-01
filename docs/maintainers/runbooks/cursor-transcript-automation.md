# Cursor / VS Code transcript automation

## Package scripts (T271)

- `pnpm run transcript:sync` — runs `workspace-kit run sync-transcripts '{}'` via `scripts/run-transcript-cli.mjs`. **Fails fast** if `dist/cli.js` is missing; run `pnpm run build` first.
- `pnpm run transcript:ingest` — runs `ingest-transcripts` via `scripts/run-transcript-cli.mjs`. **Policy-sensitive:** export `WORKSPACE_KIT_POLICY_APPROVAL` as JSON (`{"confirmed":true,"rationale":"…"}`); the script merges it into the third CLI argument as **`policyApproval`** (the `run` path does not read the env var by itself). Alternatively use interactive `workspace-kit run` or pass JSON explicitly; see `docs/maintainers/runbooks/transcript-ingestion-operations.md` and `POLICY-APPROVAL.md`.

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

`improvement.hooks.afterTaskCompleted`: `off` (default), `sync`, or `ingest`.

- **`sync`** — detached `workspace-kit run sync-transcripts '{}'` after a task transitions to **`completed`** (no policy JSON needed).
- **`ingest`** — requires **`WORKSPACE_KIT_POLICY_APPROVAL`** in the environment of the process running **`workspace-kit run run-transition`** (same JSON shape as other env approvals: `{"confirmed":true,"rationale":"…"}`). The hook **merges** that into the child’s third CLI argument as **`policyApproval`** and sets **`forceGenerate: true`**, so the child runs **`ingest-transcripts`**: **sync transcripts**, then **always** runs **`generate-recommendations`** (not cadence-gated). If the env var is missing or invalid JSON, the hook logs **`ingest-requires-WORKSPACE_KIT_POLICY_APPROVAL-json-env`** and falls back to **`sync-transcripts`** only.

Spawns a **detached** child so `run-transition` returns immediately.

Hook observability and overlap controls:

- Lock file: `.workspace-kit/improvement/transcript-hook.lock` prevents unsafe overlap (`skip-if-busy` behavior).
- Status evidence log: `.workspace-kit/improvement/transcript-hook-events.jsonl` records `started`, `completed`, `failed`, and `skipped` events with reasons (for example `lock-busy` or `cli-not-found`).

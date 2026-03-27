# When recommendations and transcript jobs run

Default posture: **nothing runs on a timer inside the package**. Any “automatic” behavior is **optional**, **config-driven**, or **external** (your CI/cron).

## Trigger matrix

| Trigger | `sync-transcripts` | `generate-recommendations` | `ingest-transcripts` | Notes |
| --- | --- | --- | --- | --- |
| **Manual CLI** | Yes: `workspace-kit run sync-transcripts '{}'` | Yes: requires **`policyApproval`** (sensitive) | Yes: sync then cadence-gated generate; **`policyApproval`** | See `transcript-ingestion-operations.md`. |
| **npm scripts** | `pnpm run transcript:sync` wraps CLI sync | `pnpm run transcript:ingest` wraps CLI ingest | Same as ingest | Scripts fail fast if `dist/` missing (run `pnpm run build` first). |
| **post-task hook** | If `improvement.hooks.afterTaskCompleted` is `sync` or `ingest` | Only if hook mode is **`ingest`** (spawns ingest, which may generate) | Effectively **`ingest`** path when set | **`ingest`** in hook context expects `WORKSPACE_KIT_POLICY_APPROVAL` in the **parent** environment that spawned the hook—**not** the same as `run` JSON approval. |
| **CI / release** | Only if you invoke it | Only if you invoke it | Optional `pre-release-transcript-hook`; non-blocking by design | No hidden schedule in the kit. |

## Cadence gates (only `ingest-transcripts`)

- **`improvement.cadence.minIntervalMinutes`** — minimum time between ingest runs’ generation steps.
- **`improvement.cadence.skipIfNoNewTranscripts`** — skip generation when sync copied no new files.

**Direct `generate-recommendations`** always runs analysis after sync inside that command; it does **not** apply the ingest-only cadence skip for “no new transcripts” in the same way as ingest’s combined flow (see improvement module docs). When in doubt, check command docs under `src/modules/improvement/`.

## Fresh clone expectations

1. **Hook** defaults to **`off`** — no background transcript work after task completion.
2. **No** recommendation is created until something runs **`generate-recommendations`** or **`ingest-transcripts`** (with policy approval) or a hook is enabled.

## “I expected this to run automatically”

1. Check **`improvement.hooks.afterTaskCompleted`** in effective config (`workspace-kit config explain …`).
2. Check **policy**: sensitive commands remain denied without **`policyApproval`** or session grant — see **`docs/maintainers/POLICY-APPROVAL.md`**.
3. Check **logs**: `.workspace-kit/improvement/transcript-hook-events.jsonl`, `transcript-automation-status`, and policy traces.

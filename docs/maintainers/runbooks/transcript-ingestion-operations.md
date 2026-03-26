# Transcript ingestion — operations runbook

Manual-first workflow for syncing agent transcripts, generating improvement recommendations, and operating frequent runs safely.

## Quickstart

1. Ensure transcripts exist: **repo-relative** `.cursor/agent-transcripts` or `.vscode/agent-transcripts`, optional `improvement.transcripts.discoveryPaths`, or **Cursor’s default** `~/.cursor/projects/<path-slug>/agent-transcripts` (slug from your workspace root, e.g. `Users-you-Workspace-repo/agent-transcripts`).
2. Generate recommendations (runs **`sync-transcripts` first**, then analyzes the archive): `workspace-kit run generate-recommendations '{"policyApproval":{"confirmed":true,"rationale":"why"}}'`  
   - Response JSON includes `data.sync` with the sync run and `data.runId` / `data.created` for the recommendation pass.
3. Optional: copy only (no generate): `workspace-kit run sync-transcripts '{}'`
4. Or combine sync + cadence-gated generation: `workspace-kit run ingest-transcripts '{"policyApproval":{"confirmed":true,"rationale":"why"}}'`

`ingest-transcripts` is policy-sensitive: include `policyApproval`, use a session grant (see below), or set `WORKSPACE_KIT_POLICY_APPROVAL` for automation.

## Policy approval and sessions

- **One-shot:** pass `policyApproval` with `confirmed: true` and a non-empty `rationale`.
- **Session reuse:** pass `"scope":"session"` once; the kit records a grant under `.workspace-kit/policy/session-grants.json` for the active `WORKSPACE_KIT_SESSION_ID` (default `default`). Later runs for the same sensitive command can succeed without repeating the payload until the session id changes or grants are cleared.
- Traces append to `.workspace-kit/policy/traces.jsonl` as today.

## Observability

- **Status (stable JSON):** `workspace-kit run transcript-automation-status '{}'`
- Sync results include `runId`, per-file `skipReasons`, scan budgets, and retry queue counters.
- Generate results include `sync` (nested transcript sync result), `runId`, and `dedupe` counts (duplicate evidence key, existing task id, cap remainder).

## Cadence and safety caps

- `improvement.cadence.minIntervalMinutes` and `skipIfNoNewTranscripts` apply to **automatic** generation inside `ingest-transcripts` only. Direct `generate-recommendations` does not use that gate.
- `improvement.cadence.maxRecommendationCandidatesPerRun` bounds how many new improvement tasks are created per generate run.
- Transcript sync honors `maxFilesPerSync`, `maxBytesPerFile`, and `maxTotalScanBytes` to keep frequent runs bounded.

## Retries

Failed file copies enqueue entries in `.workspace-kit/improvement/state.json` (`transcriptRetryQueue`) with exponential backoff and a maximum attempt count. Pending entries surface in `transcript-automation-status`.

## Privacy

Transcript-derived provenance uses redacted snippets only (see improvement ingest). Do not disable redaction when extending ingest sources.

## Optional automation

- **Pre-release (non-blocking):** `pnpm run pre-release-transcript-hook` writes `artifacts/pre-release-transcript-summary.json` and never fails the release pipeline by itself. Enable explicit approval in CI when invoking ingest.

## Troubleshooting

- **policy-denied:** supply `policyApproval`, set a session grant, or use env approval for non-interactive runs.
- **skipped-min-interval / skipped-no-new-transcripts:** expected for `ingest-transcripts`; run `generate-recommendations` directly or pass ingest args to force generation if your workflow allows it.
- **retry-exhausted:** inspect the file path and archive conflicts; resolve manually and clear queue entries if needed.

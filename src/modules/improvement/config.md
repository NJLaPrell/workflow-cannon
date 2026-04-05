# Improvement Module Config

- `improvement.transcripts.sourcePath`: optional relative source path; when empty, sync uses `discoveryPaths` and Cursor global `~/.cursor/projects/<slug>/agent-transcripts`.
- `improvement.transcripts.archivePath`: relative local archive path used by sync and generation.
- `improvement.transcripts.discoveryPaths`: ordered relative paths to try when `sourcePath` is unset (first existing directory wins). If none match, the kit also tries **Cursor’s global store** `~/.cursor/projects/<workspace-root-slug>/agent-transcripts` (slug = absolute workspace path with separators replaced by hyphens), then falls back to scanning `.cursor/agent-transcripts` under the workspace for diagnostics.
- `improvement.transcripts.maxFilesPerSync` / `maxBytesPerFile` / `maxTotalScanBytes`: scan budgets for sync.
- `improvement.cadence.minIntervalMinutes`: minimum interval between one-shot ingest generation runs.
- `improvement.cadence.skipIfNoNewTranscripts`: when **`true`** (default), automatic **`ingest-transcripts`** skips the recommendation generation step if transcript sync copied no new files—set **`false`** if you want non-transcript evidence (policy traces, config mutations, task-transition churn, optional git range) evaluated on every ingest anyway.
- `improvement.cadence.maxRecommendationCandidatesPerRun`: cap on new improvement tasks per generate run.
- `improvement.hooks.afterTaskCompleted`: `off`, `sync`, or `ingest` — optional background transcript CLI after a task transitions to `completed`. **`ingest`** requires valid JSON in **`WORKSPACE_KIT_POLICY_APPROVAL`** in the parent environment; the hook merges it into **`policyApproval`** on the child `ingest-transcripts` invocation and passes **`forceGenerate: true`** so sync + recommendation generation run each time (see `docs/maintainers/runbooks/cursor-transcript-automation.md`).

# Improvement Module Config

- `improvement.transcripts.sourcePath`: relative source path for transcript sync input (optional if discovery paths are used).
- `improvement.transcripts.archivePath`: relative local archive path used by sync and generation.
- `improvement.transcripts.discoveryPaths`: ordered relative paths to try when `sourcePath` is unset (first existing directory wins).
- `improvement.transcripts.maxFilesPerSync` / `maxBytesPerFile` / `maxTotalScanBytes`: scan budgets for sync.
- `improvement.cadence.minIntervalMinutes`: minimum interval between one-shot ingest generation runs.
- `improvement.cadence.skipIfNoNewTranscripts`: skip generation when sync finds no new files (automatic ingest only; direct `generate-recommendations` ignores this).
- `improvement.cadence.maxRecommendationCandidatesPerRun`: cap on new improvement tasks per generate run.
- `improvement.hooks.afterTaskCompleted`: `off`, `sync`, or `ingest` — optional background transcript CLI after a task transitions to `completed` (ingest requires `WORKSPACE_KIT_POLICY_APPROVAL` in the parent environment).

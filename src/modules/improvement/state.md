# Improvement Module State

- `policyTraceLineCursor`, `mutationLineCursor`, `transitionLogLengthCursor`: incremental evidence cursors.
- `transcriptLineCursors`: per-file transcript ingestion cursor map.
- `lastSyncRunAt`: most recent transcript sync execution timestamp.
- `lastIngestRunAt`: most recent one-shot ingest execution timestamp.

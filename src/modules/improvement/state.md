# Improvement Module State

Persisted at `.workspace-kit/improvement/state.json` (`schemaVersion` **2**).

- `policyTraceLineCursor`, `mutationLineCursor`, `transitionLogLengthCursor`: incremental evidence cursors.
- `transcriptLineCursors`: per-file transcript ingestion cursor map.
- `lastSyncRunAt`: most recent transcript sync execution timestamp.
- `lastIngestRunAt`: most recent one-shot ingest execution timestamp.
- `transcriptRetryQueue`: failed transcript copy retries with backoff metadata.

# ingest-transcripts

Run transcript sync and recommendation generation in one command flow.

1. Sync transcript files into the local archive.
2. Apply cadence/backoff checks from effective config.
3. Generate recommendations when cadence allows (or when forced), and return consolidated JSON output.

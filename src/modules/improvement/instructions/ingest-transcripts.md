<!--
agentCapsule|v=1|command=ingest-transcripts|module=improvement|schema_only=pnpm exec wk run ingest-transcripts --schema-only '{}'
-->

# ingest-transcripts

Run transcript sync and recommendation generation in one command flow.

1. Sync transcript files into the local archive.
2. Apply cadence/backoff checks from effective config.
3. Generate recommendations when cadence allows (or when forced), and return consolidated JSON output.

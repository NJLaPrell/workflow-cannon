<!--
agentCapsule|v=1|command=sync-transcripts|module=improvement|schema_only=pnpm exec wk run sync-transcripts --schema-only '{}'
-->

# sync-transcripts

Synchronize transcript JSONL files from a configured source path into the local archive path.

1. Discover transcript files in the source path.
2. Copy new files into the archive path without mutating source files.
3. Return deterministic JSON counts for scanned, copied, skipped, and errors.

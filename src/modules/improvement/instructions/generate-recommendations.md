# generate-recommendations

Generate evidence-backed improvement recommendations.

1. Run **`sync-transcripts`** first (same `sourcePath` / `archivePath` resolution as the standalone command) so the archive is fresh before analysis.
2. Ingest transcripts, diffs, and workflow outcomes from the updated archive and other evidence stores.
3. Score and dedupe potential recommendations.
4. Emit queue-ready recommendations with provenance links.

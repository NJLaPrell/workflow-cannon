# generate-recommendations

Generate evidence-backed improvement recommendations.

1. Run **`sync-transcripts`** first (same `sourcePath` / `archivePath` resolution as the standalone command) so the archive is fresh before analysis—**unless** JSON args include **`dryRun: true`** (rehearsal mode skips sync, transcript copies, and all persistence while still scoring candidates).
2. Ingest transcripts, diffs, and workflow outcomes from the updated archive and other evidence stores.
3. Score and dedupe potential recommendations.
4. Emit queue-ready improvement tasks with **explicit `metadata.issue`**, **`metadata.proposedSolutions`**, plus **`approach`**, **`technicalScope`**, and **`acceptanceCriteria`** derived from the evidence kind (not generic “go investigate” stubs)—and provenance links (or **`simulatedCreates`** ids when `dryRun` is true).

## Rehearsal (`dryRun`)

Pass **`"dryRun":true`** in the third JSON argument alongside required **`policyApproval`**. Response code is **`recommendations-rehearsal`**; policy traces prefix the message with **`policy-rehearsal`** for stable auditing. See **`docs/maintainers/ADR-policy-rehearsal-dry-run.md`**.

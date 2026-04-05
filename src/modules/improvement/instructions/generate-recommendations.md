# generate-recommendations

Generate evidence-backed improvement recommendations.

1. Run **`sync-transcripts`** first (same `sourcePath` / `archivePath` resolution as the standalone command) so the archive is fresh before analysis—**unless** JSON args include **`dryRun: true`** (rehearsal mode skips sync, transcript copies, and all persistence while still scoring candidates).
2. Ingest transcripts, diffs, and workflow outcomes from the updated archive and other evidence stores.
3. Score and dedupe potential recommendations.
4. Allocate the next available **`T###`** per task (same id space as execution tasks), dedupe by **`metadata.evidenceKey`**, and emit queue-ready improvement tasks with **`metadata.issue`** (interpreted problem report), **`metadata.supportingReasoning`** (heuristic + provenance summary—not a raw log paste), **`metadata.proposedSolutions`**, plus **`approach`**, **`technicalScope`**, and **`acceptanceCriteria`** derived from the evidence kind (or **`simulatedCreates`** ids when `dryRun` is true).

## Rehearsal (`dryRun`)

Pass **`"dryRun":true`** in the third JSON argument alongside required **`policyApproval`**. Response code is **`recommendations-rehearsal`**; policy traces prefix the message with **`policy-rehearsal`** for stable auditing. See **`docs/maintainers/adrs/ADR-policy-rehearsal-dry-run.md`**.

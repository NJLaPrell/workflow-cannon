# generate-recommendations

Generate evidence-backed improvement recommendations.

1. Run **`sync-transcripts`** first (same `sourcePath` / `archivePath` resolution as the standalone command) so the archive is fresh before analysis—**unless** JSON args include **`dryRun: true`** (rehearsal mode skips sync, transcript copies, and all persistence while still scoring candidates).
2. Ingest transcripts, diffs, and workflow outcomes from the updated archive and other evidence stores. Transcript friction scores **extracted message text** (Cursor JSONL), filters common assistant “work summary” noise, and attaches **pipeline forensics** (lines scanned, friction hit count, role, scored excerpt) on persisted rows—**not** a substitute for maintainer triage when you need deep interpretation.
3. Score and dedupe potential recommendations.
4. Allocate the next available **`T###`** per task (same id space as execution tasks), dedupe by **`metadata.evidenceKey`**. **Transcript-sourced** candidates persist as **`type: transcript_churn`**, **`status: research`** (intake before a human/operator synthesis step). **Non-transcript** (or non–transcript-churn) paths emit **`type: improvement`**, **`status: proposed`**, with **`metadata.issue`** (structured problem report: symptom, impact, evidence, interpretation—not “go investigate”), **`metadata.supportingReasoning`** (heuristic + provenance summary—not a raw log paste), **`metadata.proposedSolutions`**, plus **`approach`**, **`technicalScope`**, and **`acceptanceCriteria`** oriented to **deliverables and verification** (or **`simulatedCreates`** ids when `dryRun` is true). Move **`transcript_churn` / `research`** → **`improvement` / `proposed`** with **`synthesize-transcript-churn`** after investigation; then promote to **`ready`** via triage (**`run-transition`** **`accept`**) per **improvement-triage-top-three**.

## Rehearsal (`dryRun`)

Pass **`"dryRun":true`** in the third JSON argument alongside required **`policyApproval`**. Response code is **`recommendations-rehearsal`**; policy traces prefix the message with **`policy-rehearsal`** for stable auditing. See **`docs/maintainers/adrs/ADR-policy-rehearsal-dry-run.md`**.

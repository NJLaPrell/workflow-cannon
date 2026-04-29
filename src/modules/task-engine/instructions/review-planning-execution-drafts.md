<!--
agentCapsule|v=1|command=review-planning-execution-drafts|module=task-engine|schema_only=pnpm exec wk run review-planning-execution-drafts --schema-only '{}'
-->

# review-planning-execution-drafts

Dry-run review for UX/CAE execution task batches before they are persisted.

## Usage

```bash
workspace-kit run review-planning-execution-drafts '{"tasks":[...],"targetPhaseKey":"74","targetPhase":"Phase 74","desiredStatus":"ready"}'
```

## Arguments

Accepts the same draft-shaping arguments as **`persist-planning-execution-drafts`**: `tasks`, `planRef`, `planningType`, `targetPhaseKey`, `targetPhase`, and `desiredStatus`. The command normalizes rows the same way but never writes task rows or mutation evidence.

## Review Profile

The built-in review profile is **`ux-cae-pre-persist-v1`**. It returns structured findings for:

- oversized task rows that should be split into smaller implementation, verification, or rollout slices
- missing verification/test coverage
- missing rollback, activation, feature-flag, or fallback coverage
- missing empty, first-run, blank, or no-data behavior coverage
- vague acceptance criteria

## Response Codes

- `planning-execution-drafts-review-passed`: no blocking gaps found.
- `planning-execution-drafts-review-findings`: one or more findings returned; inspect `data.findings` before persisting.
- `invalid-task-schema`: row normalization failed; fix the draft shape before review or persistence.

## Review Before Persist

Run this command before persisting UX/CAE batches:

```bash
workspace-kit run review-planning-execution-drafts '{"targetPhaseKey":"74","targetPhase":"Phase 74","desiredStatus":"ready","tasks":[...]}'
workspace-kit run persist-planning-execution-drafts '{"targetPhaseKey":"74","targetPhase":"Phase 74","desiredStatus":"ready","tasks":[...],"expectedPlanningGeneration":<n>}'
```

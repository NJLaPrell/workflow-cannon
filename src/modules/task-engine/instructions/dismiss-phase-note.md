<!--
agentCapsule|v=1|command=dismiss-phase-note|module=task-engine|schema_only=pnpm exec wk run dismiss-phase-note --schema-only '{}'
-->

# dismiss-phase-note

Mark a phase note as dismissed. **`reason` is required** for operator discipline; the MVP schema does not persist it in SQLite.

**`reason`** is scanned by the same built-in secret-shaped pattern guard as phase note bodies; violations return **`phase-note-secret-rejected`**.

When **`kit.phaseJournal.requirePolicyApprovalForCriticalDismissSupersede`** is **`true`**, dismissing an **active** note with **`priority: "critical"`** requires JSON **`policyApproval`** (`confirmed: true` and non-empty **`rationale`**) on the same invocation. Without it, the command returns **`phase-note-critical-policy-approval-required`**.

## Usage

```
workspace-kit run dismiss-phase-note '{"noteId":"<uuid>","reason":"Superseded by ADR decision."}'
```

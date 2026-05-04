<!--
agentCapsule|v=1|command=supersede-phase-note|module=task-engine|schema_only=pnpm exec wk run supersede-phase-note --schema-only '{}'
-->

# supersede-phase-note

Mark `noteId` as superseded by an existing **active** note `supersededBy` in the same `phase_key`.

When **`kit.phaseJournal.requirePolicyApprovalForCriticalDismissSupersede`** is **`true`**, superseding an **active** **`noteId`** whose **`priority`** is **`critical`** requires JSON **`policyApproval`** on the same invocation. Otherwise the command returns **`phase-note-critical-policy-approval-required`**.

## Usage

```
workspace-kit run supersede-phase-note '{"noteId":"<old-uuid>","supersededBy":"<new-uuid>"}'
```

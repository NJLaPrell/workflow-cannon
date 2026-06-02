<!--
agentCapsule|v=1|command=submit-assignment-handoff|module=team-execution|schema_only=pnpm exec wk run submit-assignment-handoff --schema-only '{}'
-->

# submit-assignment-handoff

```bash
workspace-kit run submit-assignment-handoff '{"assignmentId":"<id>","workerId":"bob","handoff":{"schemaVersion":2,"assignmentId":"<id>","agentId":"bob","status":"completed","summary":"Done","evidenceRefs":["url"]},"expectedPlanningGeneration":<n>,"policyApproval":{"confirmed":true,"rationale":"submit handoff"}}'
```

Worker path: status **`assigned` → `submitted`**.

**`handoff`** accepts:
- v1: `schemaVersion` **1**, non-empty **`summary`**, optional **`evidenceRefs`** string array.
- v2: `schemaVersion` **2**, full Handoff v2 payload. For coherence, **`handoff.assignmentId`** must match **`assignmentId`** and **`handoff.agentId`** must match **`workerId`**.

**`workerId`** must match the assignment row authority checks.

Stable lifecycle errors: **`assignment-not-found`**, **`assignment-authority-denied`**, **`assignment-status-invalid`**.

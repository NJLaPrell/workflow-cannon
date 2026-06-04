<!--
agentCapsule|v=1|command=agent-execution-packet|module=team-execution|schema_only=pnpm exec wk run agent-execution-packet --schema-only '{}'
-->

# agent-execution-packet

```bash
workspace-kit run agent-execution-packet '{"assignmentId":"asg-123","workerId":"worker-1"}'
```

```bash
workspace-kit run agent-execution-packet '{"mode":"draft","taskId":"T123","phaseKey":"131"}'
```

Builds a bounded execution packet for a single assignment using the assignment row, its linked task, and resolved delivery policy.

The packet returns explicit owned, read-only, forbidden, and approval-gated path boundaries; base and suggested worker branches; validation commands; handoff contract refs; and stop conditions.

Use **assignment mode** (`assignmentId`, optional `workerId`) for worker startup. Assignment packets return `packetKind:"assignment"` and `packetLockStatus:"assignment_locked"` and are authority-bearing for the named assignment.

Use **draft mode** (`mode:"draft"`, `taskId`, optional `phaseKey`) before assignment registration. Draft packets return `packetKind:"draft"` and `packetLockStatus:"draft_unlocked"` with recommended assignment metadata and a `registerAssignmentRef` command template. Do not implement from draft packets; register the assignment and fetch the locked assignment packet first.

Workers should use the packet's **`handoffContract`** to submit a Handoff v2 JSON payload through **`submit-assignment-handoff`**. Populate machine-checkable fields first (changed files, validation command results, acceptance criteria, blockers/risks) and keep prose summary secondary.

Read-only. `workerId` is optional, but when supplied it must match the assignment worker.

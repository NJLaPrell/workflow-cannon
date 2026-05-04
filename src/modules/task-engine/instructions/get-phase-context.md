<!--
agentCapsule|v=1|command=get-phase-context|module=task-engine|schema_only=pnpm exec wk run get-phase-context --schema-only '{}'
-->

# get-phase-context

Return the most relevant **active** phase notes for current work using deterministic scoring (PHASE_JOURNAL.md).

## Usage

```
workspace-kit run get-phase-context '{"phaseKey":"78","taskId":"T100029","limit":8}'
workspace-kit run get-phase-context '{"phaseKey":"78","refs":[{"type":"module","value":"task-engine"}]}'
```

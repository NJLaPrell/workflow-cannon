<!--
agentCapsule|v=1|command=get-phase-context|module=task-engine|schema_only=pnpm exec wk run get-phase-context --schema-only '{}'
-->

# get-phase-context

Return the most relevant **active** phase notes for current work using deterministic scoring (PHASE_JOURNAL.md). Notes whose **`expires_at`** is in the past are omitted unless **`includeExpired`** is **`true`**.

When **`phaseKey`** is omitted, the command uses the **canonical current workspace phase** (`kit_workspace_status` / config fallback) or infers from **`taskId`** when that task carries phase metadata. If none apply, returns **`phase-note-phase-unresolved`**.

## Usage

```
workspace-kit run get-phase-context '{"phaseKey":"78","taskId":"T100029","limit":8}'
workspace-kit run get-phase-context '{"phaseKey":"78","refs":[{"type":"module","value":"task-engine"}]}'
workspace-kit run get-phase-context '{"phaseKey":"78","includeExpired":true}'
workspace-kit run get-phase-context '{"taskId":"T100029"}'
```

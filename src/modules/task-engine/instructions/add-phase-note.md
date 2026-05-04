<!--
agentCapsule|v=1|command=add-phase-note|module=task-engine|schema_only=pnpm exec wk run add-phase-note --schema-only '{}'
-->

# add-phase-note

Create (or return idempotently) a short phase-scoped operational note in planning SQLite.

## Usage

```
workspace-kit run add-phase-note '{"phaseKey":"78","noteType":"gotcha","summary":"Watch the drift gate after manifest changes."}'
workspace-kit run add-phase-note '{"taskId":"T100029","noteType":"finding","summary":"…","idempotencyKey":"78:T100029:note-1"}'
```

## Privacy

Do not store secrets, tokens, keys, or large pasted excerpts — summarize only.

The command applies a **built-in secret-shaped pattern guard** (no external redaction service required). Matching payloads fail with **`phase-note-secret-rejected`** and a field-specific hint.

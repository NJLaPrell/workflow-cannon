<!--
agentCapsule|v=1|command=update-phase-note|module=task-engine|schema_only=pnpm exec wk run update-phase-note --schema-only '{}'
-->

# update-phase-note

Patch **`summary`**, **`details`**, and/or **`expires_at`** on an **active** phase note. Preserves **`idempotency_key`**, **`source_command`**, author/session provenance, and note identity. Stamps **`planning_generation`** and **`updated_at`** from the current planning read.

At least one mutable field must be supplied. **`expiresAt`** may be **`null`** to clear. New non-null expiry timestamps must be **at or after** the current instant (same rule as **`add-phase-note`**).

Updated **`summary`** / **`details`** are checked by the same built-in secret-shaped pattern guard as **`add-phase-note`**; violations return **`phase-note-secret-rejected`**.

## Usage

```
workspace-kit run update-phase-note '{"noteId":"<uuid>","summary":"Revised summary"}'
workspace-kit run update-phase-note '{"noteId":"<uuid>","details":null,"expiresAt":"2027-01-01T00:00:00.000Z"}'
```

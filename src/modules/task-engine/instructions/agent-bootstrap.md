<!--
agentCapsule|v=1|command=agent-bootstrap|module=task-engine|schema_only=pnpm exec wk run agent-bootstrap --schema-only '{}'
-->

# agent-bootstrap

Single read-only JSON bundle for **agent cold start**: runs the same **contract checks** as `workspace-kit doctor`, then returns the composed **`agent-session-snapshot`** payload (suggested next, queue health, phase hints, `planningGeneration`, team context).

## Usage

```bash
workspace-kit run agent-bootstrap '{}'
workspace-kit run agent-bootstrap '{"projection":"lean"}'
```

## Behavior

1. **Doctor-equivalent contract validation** — canonical JSON contract files, parseability, and planning persistence checks (same set as `workspace-kit doctor`). On failure: `ok:false`, code `agent-bootstrap-doctor-failed`, `data.doctor.issues` lists `{ path, reason }` rows; exit status matches doctor failure class.
2. On success: `ok:true`, code `agent-bootstrap`, `data.doctor.ok=true`, and all fields from **`agent-session-snapshot`** (including `planningGeneration` / `planningGenerationPolicy`).
3. Optional **`projection":"lean"`** — adds **`data.instructionSurface`** with the same **digest-only** instruction catalog as `pnpm exec wk doctor --agent-instruction-surface-lean` (stable **`instructionSurfaceDigest`**; no `commands[]`). Use when you cache the full catalog elsewhere and only need to detect adds/removes or registry churn on cold start.

## Policy

Read-only; **`policySensitivity`:** non-sensitive (no `policyApproval` on argv). Replaces separate `doctor` + `agent-session-snapshot` calls for agents that only need JSON evidence.

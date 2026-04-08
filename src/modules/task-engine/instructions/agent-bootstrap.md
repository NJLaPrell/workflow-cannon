# agent-bootstrap

Single read-only JSON bundle for **agent cold start**: runs the same **contract checks** as `workspace-kit doctor`, then returns the composed **`agent-session-snapshot`** payload (suggested next, queue health, phase hints, `planningGeneration`, team context).

## Usage

```bash
workspace-kit run agent-bootstrap '{}'
```

## Behavior

1. **Doctor-equivalent contract validation** — canonical JSON contract files, parseability, and planning persistence checks (same set as `workspace-kit doctor`). On failure: `ok:false`, code `agent-bootstrap-doctor-failed`, `data.doctor.issues` lists `{ path, reason }` rows; exit status matches doctor failure class.
2. On success: `ok:true`, code `agent-bootstrap`, `data.doctor.ok=true`, and all fields from **`agent-session-snapshot`** (including `planningGeneration` / `planningGenerationPolicy`).

## Policy

Read-only; **`policySensitivity`:** non-sensitive (no `policyApproval` on argv). Replaces separate `doctor` + `agent-session-snapshot` calls for agents that only need JSON evidence.

# sync-effective-behavior-cursor-rule

Writes (or previews) a **Cursor rule** (`.mdc`) that summarizes the **effective** RPG-party role tier plus the **resolved behavior profile** (temperament). **Advisory only** — it does not change kit policy or replace JSON **`policyApproval`** on gated **`wk run`** commands.

## JSON args

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `outputPath` | string | no | Workspace-relative path; must stay under `.cursor/rules/`, end in `.mdc`, no `..`. Default: `.cursor/rules/workflow-cannon-effective-agent-behavior.mdc`. |
| `dryRun` | boolean | no | When `true`, do not write; response includes `contentHash` and `bytes`. |

## Behavior

- Reads **effective workspace config** (for `kit.agentGuidance`) and **agent-behavior** store state the same way **`resolve-behavior-profile`** does.
- Creates parent directories under `.cursor/rules/` as needed.
- After successful **`set-active-behavior-profile`**, **`create-behavior-profile`**, **`update-behavior-profile`**, **`delete-behavior-profile`**, **`interview-behavior-profile`** (when it persists), and **`set-agent-guidance`**, the kit schedules a **best-effort** auto-sync (fail-open; set `WORKSPACE_KIT_DEBUG_AUTO_SYNC=1` to log failures).

## Example

```bash
pnpm exec wk run sync-effective-behavior-cursor-rule '{}'
pnpm exec wk run sync-effective-behavior-cursor-rule '{"dryRun":true}'
```

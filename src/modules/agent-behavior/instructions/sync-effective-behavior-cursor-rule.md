<!--
agentCapsule|v=1|command=sync-effective-behavior-cursor-rule|module=agent-behavior|schema_only=pnpm exec wk run sync-effective-behavior-cursor-rule --schema-only '{}'
-->

# sync-effective-behavior-cursor-rule

Writes (or previews) a **Cursor rule** (`.mdc`) that summarizes the **effective** RPG-party role tier, the **resolved behavior profile** (temperament), and the resolved **agent presentation policy**. **Advisory only** — it does not change kit policy or replace JSON **`policyApproval`** on gated **`wk run`** commands.

## JSON args

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `outputPath` | string | no | Workspace-relative path; must stay under `.cursor/rules/`, end in `.mdc`, no `..`. Default: `.cursor/rules/workflow-cannon-effective-agent-behavior.mdc`. |
| `dryRun` | boolean | no | When `true`, do not write; response includes `contentHash` and `bytes`. |

## Behavior

- Reads **effective workspace config** (for `kit.agentGuidance`) and **agent-behavior** store state the same way **`resolve-behavior-profile`** does.
- Resolves **`agentPresentation.*`** with role tier and temperament into early instruction lines for visible work-log, rationale summary, technicality, and final-answer detail.
- Always writes the private-reasoning invariant: agents reason privately and never reveal chain-of-thought, hidden deliberation, scratchpad notes, or step-by-step private reasoning.
- Always writes the safety floor: blockers, required approvals, destructive-action warnings, verification failures, and residual risks remain reportable even when visible work-log is `off` or `minimal`.
- Creates parent directories under `.cursor/rules/` as needed.
- After successful **`set-active-behavior-profile`**, **`create-behavior-profile`**, **`update-behavior-profile`**, **`delete-behavior-profile`**, **`interview-behavior-profile`** (when it persists), and **`set-agent-guidance`**, the kit schedules a **best-effort** auto-sync (fail-open; set `WORKSPACE_KIT_DEBUG_AUTO_SYNC=1` to log failures).

Dashboards and response-template metadata expose the resolved presentation policy for observability. The generated Cursor rule is the early chat instruction surface.

## Example

```bash
pnpm exec wk run sync-effective-behavior-cursor-rule '{}'
pnpm exec wk run sync-effective-behavior-cursor-rule '{"dryRun":true}'
```

<!--
agentCapsule|v=1|command=resolve-agent-guidance|module=workspace-config|schema_only=pnpm exec wk run resolve-agent-guidance --schema-only '{}'
-->

# resolve-agent-guidance

```bash
workspace-kit run resolve-agent-guidance '{}'
```

## Contract (success)

Stable JSON shape:

- `ok`, `code: "agent-guidance-resolved"`
- `data.schemaVersion` — `1`
- `data.profileSetId` — e.g. `rpg_party_v1`
- `data.tier` — integer `1`–`5`
- `data.displayLabel` — human label (from config echo or catalog)
- `data.catalog` — `{ tier, id, label, description }`
- `data.hints` — `{ explanationStyle, checkInStyle, questionStyle }` (machine-oriented)
- `data.usingDefaultTier` — `true` when no persisted `kit.agentGuidance.tier`
- `data.agentPresentation` — resolved visible presentation policy with `schemaVersion: 1`, `mode`, `workLog`, `rationale`, `technicality`, `finalAnswerDetail`, and `privateReasoning: "never_disclose"`

**Advisory only** — subordinate to PRINCIPLES and policy; hosts may ignore hints.

`agentPresentation` controls visible work-log and summaries only. It never permits private chain-of-thought disclosure. The generated Cursor rule from `sync-effective-behavior-cursor-rule` is the early instruction surface; this command is read-only observability.

## See also

- `docs/maintainers/adrs/ADR-agent-guidance-profile-rpg-party-v1.md`
- `.ai/runbooks/agent-presentation-policy.md`
- `set-agent-guidance` — persist tier to project config

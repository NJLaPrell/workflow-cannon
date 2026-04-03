# ADR: Agent guidance profile (RPG party v1)

## Status

Accepted — Phase 47 (`T585`). Implementation: `kit.agentGuidance.*` config keys, `resolve-agent-guidance`, `set-agent-guidance`.

## Context

Maintainers and product want an **onboarding-chosen interaction difficulty** for AI agents: how much explanation, how often to check in, and how aggressively to ask clarifying questions. This must remain **advisory** — it does **not** override `.ai/PRINCIPLES.md`, policy tiers, or `policyApproval` requirements.

This ADR locks the **v1 catalog** (labels + copy + stable ids) and storage keys so CLI, extension, and docs stay aligned.

## Decision

1. **Stable profile set id:** `rpg_party_v1` (future sets add new ids; tooling validates against the registry).
2. **Guidance tier:** integer **1–5** mapped to RPG-themed labels (product copy deck below).
3. **Persistence:** under workspace config `kit.agentGuidance`:
   - `profileSetId` (string, default `rpg_party_v1` when omitted at resolve time),
   - `tier` (integer 1–5),
   - `displayLabel` (optional string echo of the chosen label for UI/extension).
4. **Default when unset:** effective tier **2 — Adventurer** (balanced baseline for existing workspaces with no config). Documented here and in `resolve-agent-guidance` / module README — not silently written until the operator runs `set-agent-guidance` or `config set`.
5. **Relationship to `agent-behavior`:** behavior profiles (`resolve-behavior-profile`) remain the primary **persona** layer. Guidance tier **modulates** suggested explanation depth / check-in cadence / question density in that command’s JSON (`agentGuidance.advisoryModulation`) — still advisory-only.

## Non-goals

- Replacing or bypassing policy / approvals.
- Enforcing agent compliance (hosts and clients may ignore hints).
- Storing PII or free-form prompts in `kit.agentGuidance` (only structured tier + optional label echo).

## RPG party catalog v1 (frozen copy)

| Tier | Id slug | Label   | Description (product) |
| ---: | --- | --- | --- |
| 1 | `npc` | NPC | Bare minimum: shortest answers, rare check-ins, ask only when blocked. |
| 2 | `adventurer` | Adventurer | Balanced default: clear and efficient, normal check-ins, questions when scope is ambiguous. |
| 3 | `bard` | Bard | Friendlier narration, slightly more context in summaries, moderate clarifiers. |
| 4 | `wizard` | Wizard | Deep explanations when helpful, more explicit reasoning, higher clarifier rate on risky steps. |
| 5 | `bbeg` | BBEG | Maximum verbosity and caution: frequent check-ins on big moves, many clarifying questions before irreversible actions. |

## Upgrade / migration

- New keys are **additive**. Old configs without `kit.agentGuidance` validate and resolve to **tier 2** defaults at read time.
- No automatic migration writes; operators opt in via onboarding or `set-agent-guidance`.

## References

- `docs/maintainers/TERMS.md` — execution vs advisory surfaces.
- `src/modules/agent-behavior/README.md` — behavior profile + guidance modulation.
- `src/core/agent-guidance-catalog.ts` — machine catalog + resolve helpers.

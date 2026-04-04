# Agent guidance onboarding (RPG party v1)

**Advisory only** — guidance tier does not replace PRINCIPLES, policy, or `policyApproval`. See **`docs/maintainers/ADR-agent-guidance-profile-rpg-party-v1.md`**.

**Cursor chat:** **`docs/maintainers/playbooks/workspace-kit-chat-onboarding.md`** or slash **`/onboarding`**. Long personality interview: **`docs/maintainers/playbooks/workspace-kit-chat-behavior-interview.md`** or **`/behavior-interview`**.

## Pick a tier (no hand-editing JSON)

**Option A — `workspace-kit run` (JSON tier):**

```bash
workspace-kit run set-agent-guidance '{"tier":3}'
```

**Option B — interactive (TTY):**

```bash
workspace-kit run set-agent-guidance '{"interactive":true}'
```

**Option C — `config` CLI (requires env approval for `kit.agentGuidance.*` keys):**

```bash
export WORKSPACE_KIT_POLICY_APPROVAL='{"confirmed":true,"rationale":"set agent guidance"}'
workspace-kit config set kit.agentGuidance.tier 3
workspace-kit config set kit.agentGuidance.profileSetId '"rpg_party_v1"'
workspace-kit config set kit.agentGuidance.displayLabel '"Bard"'
```

## Read effective guidance

```bash
workspace-kit run resolve-agent-guidance '{}'
```

Behavior profiles: **`resolve-behavior-profile`** includes **`data.agentGuidance`** (tier + **`advisoryModulation`**).

## Extension

The Cursor **Workflow Cannon** dashboard shows the effective tier when **`dashboard-summary`** includes **`agentGuidance`** (kit **0.47.0+**).

## See also

- **`docs/maintainers/AGENT-CLI-MAP.md`** — copy-paste lines
- **`src/modules/agent-behavior/README.md`** — modulation vs stored profiles

# Playbook: Workflow Cannon chat onboarding (party setup)

**Playbook id:** `workspace-kit-chat-onboarding`  
**Use when:** An operator runs **`/onboarding`** or asks for Workflow Cannon onboarding in chat. **Persist each step** as soon as the user answers. **Wait** between sections — do not stack prompts.

**Tone:** Light RPG tavern; **player-facing text** never shows `builtin:` ids or tier numbers unless the operator asks for power-user detail.

**Planning tokens:** When `tasks.planningGenerationPolicy` is **`require`**, read **`planningGeneration`** from **`pnpm run wk run get-next-actions '{}'`** immediately before each **`set-agent-guidance`** or **`set-active-behavior-profile`** (that command returns the token reliably).

**Does not replace:** [`.ai/PRINCIPLES.md`](../../PRINCIPLES.md), [`POLICY-APPROVAL.md`](../POLICY-APPROVAL.md), policy tiers, or **`policyApproval`**.

## 0) Bootstrap (read-only)

- `pnpm run wk doctor` — fail closed if unhealthy.
- `pnpm exec node dist/cli.js run resolve-agent-guidance '{}'` — **`tier`**, **`displayLabel`**, **`usingDefaultTier`**.
- `pnpm exec node dist/cli.js run resolve-behavior-profile '{}'` — **`effective.id`**, **`effective.label`** for temperament **Current:** line.
- `pnpm exec node dist/cli.js run list-behavior-profiles '{}'` — append **custom** profiles to §3 if needed.

## 1) Welcome

Send **exactly**:

```text
Welcome to the tavern!
```

## 2) Your Role — agent guidance

**Stop and wait for a reply before §3.**

- **`## Your Role`** as heading (markdown `##`).
- **`**Current:** {displayLabel}`** only when **`usingDefaultTier`** is **false**. When **true**, omit **Current** (nothing saved yet; effective starter is Adventurer until they save).

**Always use a numbered list 1–5** in this exact pattern:

- Line **2**: **`Adventurer (Default)`** — then em dash — short effect blurb. (Only Adventurer gets the **`(Default)`** tag — kit starter tier.)
- Line matching **saved** tier (when **`usingDefaultTier`** is false): add **`(Selected)`** after the role name, then em dash, blurb, then **`← you are here`** at the end of that line.
- Other lines: **`N. RoleName —`** blurb only (no Default/Selected).

Template (illustrative — adjust **(Selected)** / arrow to the active tier):

```markdown
## Your Role

**Current:** Wizard

1. NPC — Bare minimum; rarely checks in.
2. Adventurer (Default) — Balanced; normal check-ins; asks when scope is fuzzy.
3. Bard — Friendlier; a bit more story; moderate questions.
4. Wizard (Selected) — Deeper explanations; extra care before risky moves. ← you are here
5. BBEG — Max checkpoints before big or irreversible moves.
```

When **`usingDefaultTier`** is **true**, omit the **Current** line; put **`← you are here`** on line **2** (Adventurer) only.

**Prompt (use this line verbatim):**

`Reply with a role and I’ll save it and move on to Agent Temperament.`

**Accept:** role name, **keep** / **keep current** (re-persist same tier), or tier **1–5** if they insist. Map to **`set-agent-guidance`** tier: 1 NPC, 2 Adventurer, 3 Bard, 4 Wizard, 5 BBEG.

**Immediately after answer:** `pnpm run wk run get-next-actions '{}'` → then `pnpm run wk run set-agent-guidance '{"tier":<N>,"expectedPlanningGeneration":<g>}'`.

**Confirm (one line):** e.g. `Role saved — you’re still a Wizard.` (no `tier` / `set-agent-guidance` in player text).

## 3) Agent Temperament — behavior profile

**Stop and wait for a reply before §4.**

- **`## Agent Temperament`**
- **`**Current:** {effective.label}`** always (human label from **`resolve-behavior-profile`**).

**Always use a numbered list 1–4** (match operator transcript shape):

1. The Wary Scout — Prefers small steps, frequent check-ins, and asking before bigger edits. → `builtin:cautious`
2. The Steady Adventurer — Clear reasoning; normal autonomy when your intent is obvious. **(Default)** at end of line (catalog fallback **`builtin:balanced`**). → `builtin:balanced`
3. The Battle Tactician — Lays out tradeoffs and evidence before acting. → `builtin:calculated`
4. The Bold Experimenter — Tries parallel ideas where it’s safe; still obeys policy and tests. → `builtin:experimental`

Add **`(Selected)`** at **end of line** on the **one** row whose id matches **`data.effective.id`** (e.g. `3. The Battle Tactician — … (Selected)`). **Do not** add “in spirit” or dual markers. Custom profile → add **5.** with **`(Selected)`** at line end.

**No** **`← you are here`** on temperament.

**Prompt (verbatim):**

`Reply with a temperament and I’ll save it.`

**Accept:** flavor name, **cautious** / **balanced** / **calculated** / **experimental**, **keep** / **keep current**.

**Immediately after answer:** `get-next-actions` → `set-active-behavior-profile` with mapped **`profileId`**.

**Confirm (player-facing, no ids):** e.g. `Temperament saved — you’re rolling as the Battle Tactician.`  
**Never** append `(builtin:…)` to this line unless the operator explicitly asks for technical detail.

## 4) Optional Side Quest

After §3 succeeds:

```markdown
## Optional Side Quest

Do you want the long personality interview?

Reply yes or no. If yes, we’ll use interview-behavior-profile (often easiest from a real terminal). If no, I’ll run a quick queue smoke check and close out onboarding.
```

**Wait** for yes/no. **Yes** → `interview-behavior-profile` per module instructions. **No** → §5–6.

## 5) Smoke

`pnpm run wk run get-next-actions '{}'`

## 6) Complete

```markdown
## Onboarding Complete!

Your configuration has been updated. Onboarding is complete.
```

## 7) Camp setup (only if asked)

Transcript / improvement **`config set`** → **`WORKSPACE_KIT_POLICY_APPROVAL`** per [`POLICY-APPROVAL.md`](../POLICY-APPROVAL.md).

## 8) Fallback (no `/onboarding`)

Attach **`@docs/maintainers/playbooks/workspace-kit-chat-onboarding.md`**.

## 9) Accessibility

Numbered lists are the **default** presentation for §2 and §3. Offer an unnumbered duplicate only if the user asks.

## See also

- [`runbooks/agent-guidance-onboarding.md`](../runbooks/agent-guidance-onboarding.md)
- [`ADR-agent-guidance-profile-rpg-party-v1.md`](../ADR-agent-guidance-profile-rpg-party-v1.md)
- `.cursor/commands/onboarding.md`

# Playbook: Workflow Cannon chat behavior interview (scribe’s quiz)

**Playbook id:** `workspace-kit-chat-behavior-interview`  
**Use when:** An operator runs **`/behavior-interview`**, chooses the long interview from **`/onboarding`**, or asks for the personality interview in chat. **Persist each answer** immediately via **`interview-behavior-profile`**. **One question per message** — do not stack prompts.

**Tone:** Same light tavern vibe as [workspace-kit-chat-onboarding](./workspace-kit-chat-onboarding.md). **Player-facing text** never shows dimension ids (`changeAppetite`, …), raw profile ids, or `builtin:` unless the operator asks for power-user detail.

**Canonical question set:** [`src/modules/agent-behavior/interview.ts`](../../src/modules/agent-behavior/interview.ts) (`INTERVIEW_QUESTIONS`). If copy drifts, fix the code **or** this playbook together; `pnpm run check` enforces the fingerprint line below matches the code.

<!-- wc-behavior-interview-ids: changeAppetite,deliberationDepth,explanationVerbosity,explorationStyle,ambiguityHandling,checkInFrequency -->

**Planning tokens:** `interview-behavior-profile` does **not** participate in task-store **`planningGeneration`**. If that changes, mirror onboarding: read **`planningGeneration`** from **`get-next-actions`** immediately before any mutating `run` that requires it.

**Does not replace:** [`.ai/PRINCIPLES.md`](../../PRINCIPLES.md), [`POLICY-APPROVAL.md`](../POLICY-APPROVAL.md), or advisory limits in [`src/modules/agent-behavior/README.md`](../../src/modules/agent-behavior/README.md).

## 0) Bootstrap (read-only)

- `pnpm run wk doctor` — fail closed if unhealthy.
- Optional: `pnpm exec node dist/cli.js run resolve-behavior-profile '{}'` — **`effective.label`** if you want a **“you were rolling as …”** line before the quiz (player labels only).

## 1) Welcome

Send a short intro, then **exactly** this heading for the first beat:

```markdown
## The scribe’s quiz

The keeper slides parchment across the bar — six questions, no wrong answers.
```

**Prompt (verbatim):**

`Reply **begin** to start (or **discard** to clear any stale interview session file and bail).`

**On `discard`:** `pnpm run wk run interview-behavior-profile '{"action":"discard"}'` — confirm one line: e.g. `Interview session cleared.` — stop unless they say **begin** again.

**On `begin`:** go to §2.

## 2) Start session (once per run)

**Resume / inspect (read-only):**

```bash
pnpm run wk run interview-behavior-profile '{"action":"status"}'
```

**New session** (fails if a session file already exists — use **`discard`** or **`forceRestart`**):

```bash
pnpm run wk run interview-behavior-profile '{"action":"start"}'
pnpm run wk run interview-behavior-profile '{"action":"start","forceRestart":true}'
```

**Critical:** **`start`** without **`forceRestart`** does **not** silently wipe an existing file. To restart from step 0 after a mistake, run **`discard`** then **`start`**, or one shot: **`start`** with **`forceRestart":true`**.

## 3) Questions 1–6

**After each `answer`, stop** until the user replies again.

**Accept:** number **`1`**, **`2`**, **`3`** (or **`1`–`2`** where only two options exist), **or** the exact **`value`** word in the mapping below (case as shown). Map digits → value, then:

```bash
pnpm run wk run interview-behavior-profile '{"action":"answer","value":"<value>"}'
```

**Power-user line** (repeat with their chosen value):

```bash
pnpm run wk run interview-behavior-profile '{"action":"answer","value":"balanced"}'
```

**On `back`:** `pnpm run wk run interview-behavior-profile '{"action":"back"}'` — if JSON says **`atStart`**, say you’re already on the first question; otherwise re-show **`data.question`** in the numbered player format.

### Question 1 — change appetite

**Prompt:** When suggesting code changes, how aggressive should the agent be?

1. **conservative** — Conservative — smallest diffs, extra caution  
2. **balanced** — Balanced — sensible defaults  
3. **bold** — Bold — willing to propose larger refactors when helpful  

**Prompt (verbatim after listing):** `Reply with **1**, **2**, **3**, or **conservative** / **balanced** / **bold**.`

### Question 2 — deliberation depth

**Prompt:** How much should the agent think out loud before acting?

1. **low** — Low — get to the point  
2. **medium** — Medium — short reasoning  
3. **high** — High — explicit tradeoffs and checks  

**Prompt (verbatim):** `Reply with **1**, **2**, **3**, or **low** / **medium** / **high**.`

### Question 3 — explanation verbosity

**Prompt:** How verbose should explanations be?

1. **terse** — Terse  
2. **normal** — Normal  
3. **verbose** — Verbose — more context and structure  

**Prompt (verbatim):** `Reply with **1**, **2**, **3**, or **terse** / **normal** / **verbose**.`

### Question 4 — exploration style

**Prompt:** When exploring solutions, prefer:

1. **linear** — Linear — one path at a time  
2. **parallel** — Parallel — briefly compare alternatives  

**Prompt (verbatim):** `Reply with **1**, **2**, **linear**, or **parallel**.`

### Question 5 — ambiguity

**Prompt:** When requirements are ambiguous:

1. **ask** — Ask the user before assuming  
2. **decide** — Make a reasonable assumption and state it  

**Prompt (verbatim):** `Reply with **1**, **2**, **ask**, or **decide**.`

### Question 6 — check-ins

**Prompt:** How often should the agent pause for your confirmation on non-policy judgment calls?

1. **rare** — Rarely — only when high impact  
2. **normal** — Normal  
3. **often** — Often — prefer checkpoints  

**Prompt (verbatim):** `Reply with **1**, **2**, **3**, or **rare** / **normal** / **often**.`

### When JSON says interview is complete

Response code **`behavior-interview-complete`**. Summarize choices in **plain language** (no dimension names), then go to §4.

## 4) Save or walk away

```markdown
## Your profile

**apply** — I’ll run **`finalize`** with **`apply:true`** and **omit `customId`** so the CLI picks the first free **`custom:chat-behavior-interview`** slot and default label **`Scribe's profile`**.

**`custom:`** + slug (e.g. **`custom:my-party-profile`**) — Optional **`label`** — then **`finalize`** with that **`customId`** and **`apply:true`**.

**discard** — Abandon without saving a custom profile (`{"action":"discard"}` clears the session; you keep your previous active profile).
```

**Wait** for their choice.

**Default apply path (shell):** `pnpm run wk run interview-behavior-profile '{"action":"finalize","apply":true}'`

**`custom:…` + optional label:** include **`customId`** / **`label`** in the same JSON.

**`discard`:** `pnpm run wk run interview-behavior-profile '{"action":"discard"}'`.

**Confirm (player-facing):** one short line — e.g. `Saved — you’re on Scribe’s profile now.` — **no** `builtin:` / **`custom:`** in the toast unless they asked for technical detail.

**Draft-only path:** `apply:false` is valid but rarely needed in chat; if used, say clearly that the profile was **not** set active.

## 5) Smoke

`pnpm run wk run get-next-actions '{}'`

## 6) Complete

```markdown
## Behavior interview complete!

Your answers are saved. The interview is closed.
```

## 7) Fallback (no `/behavior-interview`)

Attach **`@docs/maintainers/playbooks/workspace-kit-chat-behavior-interview.md`**.

## 8) Accessibility

Numbered lists are the **default**. Offer a compact unnumbered recap only if the user asks.

## See also

- [`src/modules/agent-behavior/instructions/interview-behavior-profile.md`](../../src/modules/agent-behavior/instructions/interview-behavior-profile.md)
- [`workspace-kit-chat-onboarding.md`](./workspace-kit-chat-onboarding.md) — optional side quest entry
- [`runbooks/agent-guidance-onboarding.md`](../runbooks/agent-guidance-onboarding.md)
- `.cursor/commands/behavior-interview.md`

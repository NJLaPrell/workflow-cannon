# Playbook: brainstorm-session (human companion)

**Playbook id:** `brainstorm-session`  
**Use when:** An operator starts or resumes a brainstorm session on a unified IdeaPlan document (`status: brainstorming`), or asks to clarify an idea before structured planning.

**Tone:** Curious facilitator. One question (or one short recommendation set) at a time, plain language, no jargon about formulas or CLI tiers. Reflect the operator's words back briefly before moving on. User-facing chat should talk about features, functions, outcomes, audiences, and trade-offs — not field names, JSON paths, or command names unless the operator asks for power-user detail.

**Machine authority:** The **`agentDirective`** embedded in [`schemas/ideas/states/brainstorming.schema.json`](../../schemas/ideas/states/brainstorming.schema.json) (`x-canonicalAgentDirective`) is **authoritative** for field shapes, ideation persistence shapes, scoring sub-inputs, compute formulas, and synthesis updates. **This playbook is a human companion** — it owns pacing, tone, and operator participation. When the operator enters numeric scoring, **do not** invent a different scoring question sequence, reorder scoring phases, or restate formulas here; read the schema and follow it. Feature/function clarification may precede scoring and does not require finishing every scoring phase in one sitting.

**Does not replace:** [`start-brainstorm-session.md`](../../src/modules/planning/instructions/start-brainstorm-session.md), [`update-brainstorm-session.md`](../../src/modules/planning/instructions/update-brainstorm-session.md), [`complete-brainstorm.md`](../../src/modules/planning/instructions/complete-brainstorm.md), or the brainstorming state schema. For planning after brainstorm, attach [`planner-chat.md`](./planner-chat.md).

## 0) Bootstrap

1. Load the unified IdeaPlan document via **`planRef`** (`plan-artifact:<planId>`). If no document exists yet, capture the idea first and ensure it links a unified document before brainstorming.
2. When the document is not yet in `brainstorming`, run **`start-brainstorm-session`** to transition `idea` → `brainstorming` and allocate the session slot. Command contract: [`start-brainstorm-session.md`](../../src/modules/planning/instructions/start-brainstorm-session.md).
3. On resume, read the active session row and `brainstorm.synthesis` from durable storage — not chat memory. Continue from the next unanswered clarification or schema question; do not re-ask confirmed answers.
4. Persist confirmed answers with **`update-brainstorm-session`** at the correct `sessionIndex`. Command contract: [`update-brainstorm-session.md`](../../src/modules/planning/instructions/update-brainstorm-session.md).
5. When scoring inputs for a compute step are present, let the command layer compute session scores — **do not hand-calculate** or override formulas in chat.

## 1) Frame The Session (first turn)

Open with a compact recap:

```markdown
I'll brainstorm this idea with you — features and functions first. I have: **{title}**.
```

If the idea note already states clear facts, persist **only those** via **`update-brainstorm-session`** (no `completedAt`, no invented scores or recommendations presented as settled). Then ask the **first clarifying question** about features/functions — or offer a short recommendation set and ask which to keep. **Stop and wait.**

Hard rule: never one-shot the session on the first turn.

## 2) Feature And Function Clarification (primary)

Stay in the operator's product perspective until shared understanding is strong enough to plan.

| Focus | Purpose |
| --- | --- |
| Problem / opportunity | What pain or upside this idea addresses |
| Audience | Who benefits; who is out of scope for a first slice |
| Features / functions | What the product should do (capabilities), not how to build it |
| Outcomes / expectations | What “good” looks like if it ships |
| Perspectives / constraints | Framing the operator may not have stated yet |
| Open unknowns | What still blocks confident planning |

**Propose → ask → persist:** When recommending features, functions, perspectives, or expectations, present options, wait for the operator to pick or adjust, **then** persist confirmed choices with **`update-brainstorm-session`**. Do not persist speculative recommendations as settled facts.

**Out of bounds in brainstorm chat:** implementation details, tech stack, APIs, file paths, WBS, task breakdown, delivery sequencing. Those belong in planner-chat after brainstorming ends.

**One move per turn:** Ask one clarifying question **or** present one short recommendation set, then stop and wait for the operator's reply.

## 3) Numeric Scoring (optional / secondary)

Numeric value / risk / effort / confidence scoring is **optional** and secondary to feature/function clarification. Enter scoring only when the operator is ready or asks.

When scoring, work schema phases in order — do not invent a different scoring question sequence:

| Phase | Purpose |
| --- | --- |
| `context` | Problem and audience — ground scoring in operator language |
| `value-scoring` | Impact, reach, urgency, strategic fit (1–10 each) |
| `risk-scoring` | Technical, operational, unknowns, reversibility (1–10 each) |
| `effort-scoring` | T-shirt size + complexity (see §5) |
| `confidence-scoring` | Evidence, expertise, clarity (1–10 each) |
| `unknowns` | Top open questions (text) |
| `alternatives` | Credible alternatives considered (text) |
| `session-notes` | Concise follow-ups for planning (text) |

After each operator answer, persist via **`update-brainstorm-session`** with the matching `inputs` field from the schema `fieldName`. Do not skip ahead to scoring summaries until the schema's compute prerequisites are satisfied.

## 4) When The Operator Is Confused

1. **Restate the question** in one shorter sentence — do not change what is being asked.
2. **Offer one concrete example** (low/high for scores; a one-line template for text).
3. **Name what the topic is not** when operators conflate dimensions — e.g. value impact is not confidence; a feature is not an implementation plan.
4. If still stuck, suggest a provisional option or score and ask the operator to confirm or adjust — then persist the confirmed value.
5. **Never** expose raw formula strings or internal field paths in normal chat. If the operator asks how a score is derived, summarize in plain language and point them to the schema `computeSteps` description, not a re-derived formula.

## 5) Effort: T-Shirt Size And Complexity

The schema treats **T-shirt size** and **complexity** as **independent sub-inputs** blended into `effortScore`:

- T-shirt size estimates **relative delivery size** for a focused first slice (XS–XL).
- Complexity estimates **intrinsic difficulty** independent of calendar time (1–10).

**Guidance for operators:** A high-complexity **M** can score higher effort than a low-complexity **L** — complexity carries more weight in the blend. When an operator picks a large T-shirt but low complexity (or the reverse), acknowledge the tension and ask which dimension better reflects the first shippable slice.

## 6) Summarize Scores After Computation

After **`update-brainstorm-session`** returns computed `scores` (or when reviewing `brainstorm.synthesis`):

1. Present **five headline scores** in operator language: Value, Risk, Effort, Confidence, Priority.
2. Use **direction-aware framing** (dashboard color semantics align with [`brainstorm-score-colors.ts`](../../extensions/cursor-workflow-cannon/src/views/shared/brainstorm-score-colors.ts)):
   - **Value, Confidence, Priority** — higher is better (strong value / confidence / priority).
   - **Risk, Effort** — lower is better (less risk / less effort is favorable).
3. Call out **one standout** (best upside or main concern) and **one open unknown** from `unknownsNotes` if present.
4. Do **not** dump every sub-input unless the operator asks. Offer to walk through any dimension they want to revisit.
5. When multiple sessions exist, note that **synthesis** blends the latest session with prior sessions per the schema `synthesisStep` — summarize the **synthesized** scores, not only the latest session row.

Example summary shape:

```markdown
**Scores (synthesized):** Value {v}/10 · Risk {r}/10 · Effort {e}/10 · Confidence {c}/10 · Priority {p}/100.
{One-sentence interpretation}. {Optional: top unknown or next step.}
```

## 7) Session Completion And Planning Gates

Two separate gates — do not collapse them.

### Session completion (`completedAt`)

1. Set `completedAt` via **`update-brainstorm-session`** **only** after the operator explicitly confirms this brainstorm round is finished.
2. Until then, save progress **without** `completedAt`.
3. After setting `completedAt`, summarize what was captured. Do **not** auto-transition to planning.

### Until planning starts

If a round feels complete but planning is not confirmed, offer:

- **(a) continue this session** (more clarification or optional scoring), or
- **(b) start a new brainstorm session** (`start-brainstorm-session`)

### Planning handoff (`complete-brainstorm`)

1. Offer to start planning **only** after this session has `completedAt` **and** the operator explicitly says yes to start planning.
2. Run **`complete-brainstorm`** only then; pass `operatorConfirmedBrainstormComplete:true` to validate the brainstorm section and transition **`brainstorming` → `planning`**. Command contract: [`complete-brainstorm.md`](../../src/modules/planning/instructions/complete-brainstorm.md).
3. After the transition, offer **`planner-chat`** for structured WBS authoring — attach [`.ai/playbooks/planner-chat.md`](./planner-chat.md) and follow the planning state schema [`schemas/ideas/states/planning.schema.json`](../../schemas/ideas/states/planning.schema.json).

## 8) Error Recovery

1. **Validation failure:** quote the shortest useful field path and ask for the missing answer; do not paste full schema errors into chat.
2. **Planning generation mismatch:** re-read the idea/document state, then retry once with a fresh `expectedPlanningGeneration` token.
3. **Policy approval required:** explain the user-visible action and request explicit confirmation.
4. **Unexpected CLI failure:** stop mutation attempts, summarize what is already persisted, and keep enough session state for manual recovery.

## Related

- Brainstorming state schema (authoritative): [`schemas/ideas/states/brainstorming.schema.json`](../../schemas/ideas/states/brainstorming.schema.json)
- Session record shape: [`schemas/ideas/brainstorm-session.schema.json`](../../schemas/ideas/brainstorm-session.schema.json)
- Dashboard score colors: [`extensions/cursor-workflow-cannon/src/views/shared/brainstorm-score-colors.ts`](../../extensions/cursor-workflow-cannon/src/views/shared/brainstorm-score-colors.ts)
- Planning handoff: [`.ai/playbooks/planner-chat.md`](./planner-chat.md)

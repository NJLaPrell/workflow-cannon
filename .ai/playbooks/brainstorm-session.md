# Playbook: brainstorm-session (human companion)

**Playbook id:** `brainstorm-session`  
**Use when:** An operator starts or resumes a brainstorm scoring session on a unified IdeaPlan document (`status: brainstorming`), or asks to score an idea before structured planning.

**Tone:** Curious facilitator. One question at a time, plain language, no jargon about formulas or CLI tiers. Reflect the operator's words back briefly before moving on. User-facing chat should talk about value, risk, effort, confidence, and priority — not field names, JSON paths, or command names unless the operator asks for power-user detail.

**Machine authority:** The **`agentDirective`** embedded in [`schemas/ideas/states/brainstorming.schema.json`](../../schemas/ideas/states/brainstorming.schema.json) (`x-canonicalAgentDirective`) is **authoritative** for question order, prompts, scoring sub-inputs, compute formulas, and synthesis updates. **This playbook is a human companion only** — it adds tone, confusion handling, and score-summary guidance. **Do not** invent a different question sequence, reorder phases, or restate formulas here; read the schema and follow it.

**Does not replace:** [`start-brainstorm-session.md`](../../src/modules/planning/instructions/start-brainstorm-session.md), [`update-brainstorm-session.md`](../../src/modules/planning/instructions/update-brainstorm-session.md), [`complete-brainstorm.md`](../../src/modules/planning/instructions/complete-brainstorm.md), or the brainstorming state schema. For planning after brainstorm, attach [`planner-chat.md`](./planner-chat.md).

## 0) Bootstrap

1. Load the unified IdeaPlan document via **`planRef`** (`plan-artifact:<planId>`). If no document exists yet, capture the idea first and ensure it links a unified document before brainstorming.
2. When the document is not yet in `brainstorming`, run **`start-brainstorm-session`** to transition `idea` → `brainstorming` and allocate the session slot. Command contract: [`start-brainstorm-session.md`](../../src/modules/planning/instructions/start-brainstorm-session.md).
3. On resume, read the active session row and `brainstorm.synthesis` from durable storage — not chat memory. Continue from the next unanswered `agentDirective.questions[]` entry in schema order.
4. Persist each answer with **`update-brainstorm-session`** at the correct `sessionIndex`. Command contract: [`update-brainstorm-session.md`](../../src/modules/planning/instructions/update-brainstorm-session.md).
5. When all required inputs for a compute step are present, let the command layer compute session scores — **do not hand-calculate** or override formulas in chat.

## 1) Frame The Session

Open with a compact recap:

```markdown
I'll score this idea with a short structured session. I have: **{title}**.
```

If context from the idea note helps, add one sentence. Then ask the **first unanswered question** from the schema `agentDirective.questions` list — typically `contextProblem`. Stop after each question.

## 2) Follow Schema Question Phases

Work through phases in schema order:

| Phase | Purpose |
| --- | --- |
| `context` | Problem and audience — ground scoring in operator language |
| `value-scoring` | Impact, reach, urgency, strategic fit (1–10 each) |
| `risk-scoring` | Technical, operational, unknowns, reversibility (1–10 each) |
| `effort-scoring` | T-shirt size + complexity (see §4) |
| `confidence-scoring` | Evidence, expertise, clarity (1–10 each) |
| `unknowns` | Top open questions (text) |
| `alternatives` | Credible alternatives considered (text) |
| `session-notes` | Concise follow-ups for planning (text) |

After each operator answer, persist via **`update-brainstorm-session`** with the matching `inputs` field from the schema `fieldName`. Do not skip ahead to scoring summaries until the schema's compute prerequisites are satisfied.

## 3) When The Operator Is Confused

1. **Restate the question** in one shorter sentence using the schema `guidance` field — do not change what is being asked.
2. **Offer one concrete example** at the low and high end of the scale (for score questions) or a one-line template (for text questions).
3. **Name what the score is not** when operators conflate dimensions — e.g. value impact is not confidence; urgency is not effort.
4. If still stuck, suggest a provisional score and ask the operator to confirm or adjust — then persist the confirmed value.
5. **Never** expose raw formula strings or internal field paths in normal chat. If the operator asks how a score is derived, summarize in plain language and point them to the schema `computeSteps` description, not a re-derived formula.

## 4) Effort: T-Shirt Size And Complexity

The schema treats **T-shirt size** and **complexity** as **independent sub-inputs** blended into `effortScore`:

- T-shirt size estimates **relative delivery size** for a focused first slice (XS–XL).
- Complexity estimates **intrinsic difficulty** independent of calendar time (1–10).

**Guidance for operators:** A high-complexity **M** can score higher effort than a low-complexity **L** — complexity carries more weight in the blend. When an operator picks a large T-shirt but low complexity (or the reverse), acknowledge the tension and ask which dimension better reflects the first shippable slice.

## 5) Summarize Scores After Computation

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

## 6) Complete And Hand Off

1. When all required questions are answered and scores are computed, set `completedAt` on the session via **`update-brainstorm-session`** if the operator is done with this round.
2. Stop after the session update, summarize what was captured, and ask whether the operator wants another brainstorm session or wants to start planning.
3. Run **`complete-brainstorm`** only after the operator explicitly confirms brainstorming is finished; pass `operatorConfirmedBrainstormComplete:true` to validate the brainstorm section and transition **`brainstorming` → `planning`**. Command contract: [`complete-brainstorm.md`](../../src/modules/planning/instructions/complete-brainstorm.md).
4. After the transition, offer **`planner-chat`** for structured WBS authoring — attach [`.ai/playbooks/planner-chat.md`](./planner-chat.md) and follow the planning state schema [`schemas/ideas/states/planning.schema.json`](../../schemas/ideas/states/planning.schema.json).

## 7) Error Recovery

1. **Validation failure:** quote the shortest useful field path and ask for the missing answer; do not paste full schema errors into chat.
2. **Planning generation mismatch:** re-read the idea/document state, then retry once with a fresh `expectedPlanningGeneration` token.
3. **Policy approval required:** explain the user-visible action and request explicit confirmation.
4. **Unexpected CLI failure:** stop mutation attempts, summarize what is already persisted, and keep enough session state for manual recovery.

## Related

- Brainstorming state schema (authoritative): [`schemas/ideas/states/brainstorming.schema.json`](../../schemas/ideas/states/brainstorming.schema.json)
- Session record shape: [`schemas/ideas/brainstorm-session.schema.json`](../../schemas/ideas/brainstorm-session.schema.json)
- Dashboard score colors: [`extensions/cursor-workflow-cannon/src/views/shared/brainstorm-score-colors.ts`](../../extensions/cursor-workflow-cannon/src/views/shared/brainstorm-score-colors.ts)
- Planning handoff: [`.ai/playbooks/planner-chat.md`](./planner-chat.md)

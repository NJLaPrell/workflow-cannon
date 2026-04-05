<!-- GENERATED FROM .ai/playbooks/wishlist-intake-to-execution.md — edit that file; do not hand-edit this render (see docs/maintainers/ADR-ai-canonical-maintainer-docs-pipeline.md) -->

# Playbook: wishlist intake → execution

**Playbook id:** `wishlist-intake-to-execution`  
**Use when:** An operator wants an agent to **rank** open wishlist ideation (**`type: "wishlist_intake"`**), confirm **process now vs delay**, clarify scope, pick a **target phase** for new execution tasks, and run **`convert-wishlist`** without hand-editing the task store.

Does **not** replace [`RELEASING.md`](../RELEASING.md), policy gates, or maintainer judgment on roadmap — it sequences **read → recommend → decide → persist via CLI**.

## Id spaces (do not confuse)

**Wishlist intake** (`wishlist_intake`, stable **`T###`**, wire status **`open`** / **`converted`** / **`cancelled`**) is **ideation before scheduling**. **Improvement** tasks use **`type: "improvement"`** with normal **`T###`** ids (pipeline or **`create-task`**); legacy rows may still show **`imp-*`** ids. Lifecycle: **`generate-recommendations`** / triage transitions (**`accept`** / **`reject`**) plus standard task-engine updates. **Executable** work uses normal **`T###`** types in the **`tasks-only`** queues.

Canonical table: [`runbooks/wishlist-workflow.md`](../runbooks/wishlist-workflow.md). Glossary: [`TERMS.md`](../TERMS.md) → **Wishlist**, **Improvement Task**, **Execution Task**.

## 0) Bootstrap (read-only)

1. When persistence or kit health is uncertain: `workspace-kit doctor` (see [`AGENT-CLI-MAP.md`](../AGENT-CLI-MAP.md) Tier C discovery).
2. Inventory ideation:

```bash
workspace-kit run list-wishlist '{}'
workspace-kit run list-wishlist '{"status":"open"}'
```

3. Before recommending a specific item, load it:

```bash
workspace-kit run get-wishlist '{"wishlistId":"<T###-or-W###>"}'
```

`wishlistId` may be the intake task id (**`T###`**) or a legacy **`W###`** when `metadata.legacyWishlistId` exists — see `src/modules/task-engine/instructions/get-wishlist.md`.

Instruction paths: `src/modules/task-engine/instructions/list-wishlist.md`, `get-wishlist.md`. Conversion contract: `src/modules/task-engine/instructions/convert-wishlist.md`.

## 1) Shortlist with a rubric

Among **`open`** wishlist rows (engine status **`proposed`**), mentally score candidates:

1. **Roadmap fit** — aligns with [`ROADMAP.md`](../ROADMAP.md) and [`data/workspace-kit-status.yaml`](../data/workspace-kit-status.yaml); flag explicit conflicts.
2. **Unblockers** — clears ambiguity for **`convert-wishlist`** (decomposition + concrete child **`T###`** payloads).
3. **Risk** — prefer small, reversible slices; call out policy, migration, or approval-model touchpoints per [`.ai/PRINCIPLES.md`](../../../.ai/PRINCIPLES.md).
4. **Dedupe** — skip if **`ready`** / **`in_progress`** execution tasks already cover the same outcome (titles + `evidenceRef`).

Pick **one** primary recommendation. It is valid to recommend **none** if the backlog is empty or nothing clears the bar.

## 2) Operator choice: process now vs delay

Present **title**, a **plain-language summary** (problem, outcome, constraints), and **why this item** beats alternatives.

Ask explicitly: **convert now** or **defer**. If the operator defers **this** id, exclude that `wishlistTaskId` and offer another candidate from step 1.

## 3) Clarify before mutating

After the operator commits to an item:

1. Ask **clarifying questions** until decomposition boundaries are clear.
2. Capture **explicit decisions** (scope in/out, dependencies, phase intent).
3. Write a **short tasking plan** (which new **`T###`** ids, titles, and dependency intent) **before** any **`convert-wishlist`** invocation.

If `evidenceRef` points at planning module output, optionally open that artifact for context — no planning code changes are required by this playbook.

## 4) Target phase for new tasks

Default bucket selection:

1. If `docs/maintainers/data/workspace-kit-status.yaml` **`next_kit_phase`** has **no** tasks in non-terminal execution statuses (**`proposed`**, **`ready`**, **`in_progress`**, **`blocked`**, **`paused`**) for that numeric phase key, use that **`phaseKey`** and a matching human **`phase`** label on each new task payload.
2. Else use the **smallest integer `phaseKey` strictly greater** than the maximum `phaseKey` in use such that **no** tasks exist in those non-terminal statuses for that key.
3. If still ambiguous or conflicting with maintainer intent, **soft-gate** and ask the operator.

Use `workspace-kit run list-tasks` with filters as needed; do not infer phase solely from chat.

## 5) Persist: `convert-wishlist` only via CLI

1. Build **`decomposition`** (`rationale`, `boundaries`, `dependencyIntent`) and the **`tasks`** array per `src/modules/task-engine/instructions/convert-wishlist.md`. Each task needs workable fields including **`phase`** and optional **`phaseKey`** aligned to the bucket from step 4.
2. **Tiering and copy-paste** patterns: [`AGENT-CLI-MAP.md`](../AGENT-CLI-MAP.md) — wishlist mutations (including **`convert-wishlist`**) are Tier **C** by default; still obey **planning-generation** rules below.
3. **Planning generation hygiene:** when `tasks.planningGenerationPolicy` is **`require`**, pass **`expectedPlanningGeneration`** from **`planningGeneration`** on your **last** read (`list-wishlist`, `list-tasks`, `get-task`, `get-next-actions`, etc.). On **`planning-generation-mismatch`**, re-read and retry with the fresh token — see [`ADR-planning-generation-optimistic-concurrency.md`](../ADR-planning-generation-optimistic-concurrency.md).

```bash
workspace-kit run convert-wishlist '{"wishlistTaskId":"<T###>","expectedPlanningGeneration":<n>,"decomposition":{...},"tasks":[...]}'
```

Do **not** hand-edit SQLite or JSON task stores for conversion.

## 6) Verify

1. `workspace-kit run get-wishlist '{"wishlistId":"<T###>"}'` — intake should show **`converted`** (engine **`completed`** with conversion metadata).
2. `workspace-kit run list-tasks '{}'` or filtered queries — new execution tasks exist with intended **`phase`** / **`phaseKey`**.
3. `workspace-kit run get-next-actions '{}'` — new **`ready`** work appears as appropriate.

## Related

- Runbook: [`runbooks/wishlist-workflow.md`](../runbooks/wishlist-workflow.md)
- Requestable Cursor rule: `.cursor/rules/playbook-wishlist-intake-to-execution.mdc`

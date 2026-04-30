# REF-002 — Decompose `context-activation/index.ts`

| Field | Value |
| --- | --- |
| **Proposal ID** | REF-002 |
| **Suggested `type`** | `improvement` |
| **Primary paths** | `src/modules/context-activation/index.ts`, `src/modules/context-activation/trace-store.ts`, `src/core/cae/*.ts` |

---

## Problem statement

`context-activation/index.ts` spans **~1.5k lines**: CAE SQLite access, pagination helpers, evaluation, guidance catalog, registry admin bridging, trace/session handling, maintainer-facing cards. Mixed concerns reduce **reviewability** and **test surface clarity**.

---

## Goals

1. **Modularity:** `index.ts` only registers **`WorkflowModule`** and binds imports; **`handlers/`** (or **`commands/`**) own each instruction group.
2. **Reuse:** Lift **generic pagination** (`encodeCursor` / `decodeCursor` / `paginateIds`) to **`pagination.ts`** if not already shared with other modules.
3. **Reliability:** Identical JSON outputs for each **`cae-*`** and related commands; **no** schema drift.
4. **Maintainability:** CAE maintainers can change **one handler file** without scrolling unrelated flows.

---

## Out of scope

- Changing **CAE evaluation semantics** or registry DDL (unless a bug is found during move-only work).
- Renaming public **`workspace-kit run`** commands.

---

## Implementation plan

1. Map **`onCommand`** dispatch branches in `index.ts` to named groups (evaluation, registry admin, trace, ack, guidance draft, …).
2. Extract **pure utilities** (`requireSchemaV1`, cursor helpers) → `pagination.ts` or `cae-args.ts`.
3. For each group, **`handlers/<name>.ts`** exporting async functions **`(args, ctx) => ModuleCommandResult`** or a typed dispatch table.
4. **`contextActivationModule`** in **`index.ts`** stays the single **`WorkflowModule`** export; **`registration`** unchanged.
5. Cross-check **`src/modules/context-activation/instructions/*.md`** still match argv/JSON shapes (**schema-only** pass).

---

## Task links

| Link | Purpose |
| --- | --- |
| `REF-006` | If `core/cae/` is also reorganized, align handler names with `cae/*` subpackages |
| **`core/cae/cae-kit-sqlite.ts`** | Shared DB; avoid duplicating open/close patterns when extracting |

---

## Acceptance criteria

- [ ] `context-activation/index.ts` line count **materially reduced** (dispatch-only + module const).
- [ ] **`pnpm run build`** and **`pnpm run test`** pass.
- [ ] Spot-check: **`cae-evaluate`**, **`cae-explain`**, **`list-cae-*`** style commands — **schema-only** and/or golden fixture if present.
- [ ] No new **sibling-module** imports (see REF-004); context-activation may only import **`core`**, **`contracts`**, and local files per **`src/README.md`**.

---

## create-task payload (starter)

```json
{
  "id": "T###",
  "title": "[REF-002] Decompose context-activation index megamodule",
  "status": "proposed",
  "type": "improvement",
  "technicalScope": [
    "Split context-activation onCommand into handlers/* with thin index.ts registration.",
    "Extract shared pagination helpers to a dedicated module file.",
    "Preserve all cae-* command JSON behavior."
  ],
  "acceptanceCriteria": [
    "index.ts is primarily registration and dispatch.",
    "Build + tests green; schema-only smoke for representative CAE commands.",
    "Instructions under context-activation/instructions still accurate."
  ],
  "metadata": {
    "issue": "context-activation/index.ts mixes many CAE CLI concerns in one file.",
    "supportingReasoning": "Large single file complicates maintenance and increases merge conflict rates for unrelated CAE changes.",
    "evidenceRefs": ["tasks/refactor-proposals/REF-002-decompose-context-activation.md", "src/modules/context-activation/index.ts"]
  }
}
```

---

## Risk & rollback

- **Risk:** Subtle **`this`**/closure dependency if any handler relied on mutable outer state — extract with explicit parameters.
- **Rollback:** Single-revert PR if moves are mechanical.

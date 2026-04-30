# REF-007 — Layer CLI: `cli.ts`, `run-command`, policy, doctor

| Field | Value |
| --- | --- |
| **Proposal ID** | REF-007 |
| **Suggested `type`** | `improvement` |
| **Primary paths** | `src/cli.ts`, `src/cli/run-command.ts`, `src/cli/interactive-policy.ts`, `src/cli/doctor-*.ts` |

---

## Problem statement

**CLI entrypoints** fuse **bootstrap** (`dotenv`, profile, config mutations), **`run`** pipeline (policy, CAE merge, checkpoints, transcripts), **`doctor`** assembly, exit codes. Cross-talk makes **narrow fixes** risky (e.g. policy trace vs catalog JSON).

---

## Goals

1. **Modularity:** **`cli/commands/`** modules: `run.ts`, `doctor.ts`, `config.ts`, `profile.ts`, each exporting **small** **`runXYZ(argv, ctx)`**.
2. **Maintainability:** **Policy merging** centralized (`cli/policy-session.ts`) — **`run-command.ts`** delegates to **`core/policy`** wrappers without duplicating lore.
3. **Reliability:** **Exit-code contract** centralized table (success vs usage vs validation vs internal).
4. **Efficiency:** Easier selective tests (hypothetical future: unit test **`peelRunArgv`** in isolation).

---

## Out of scope

- Redesign **`wk`** UX or argv grammar (beyond extraction).
- **`POLICY_APPROVAL`** semantics (**`.ai/POLICY-APPROVAL.md`** unchanged).

---

## Implementation plan

1. Extract **`peelRunArgv`** and **`policyDeniedBody`** (and similar) to **`cli/run-helpers.ts`** if **pure**.
2. Move **`doctor`** collation from **`cli.ts`** to **`cli/doctor/index.ts`** re-exporting **existing** **`doctor-*`** collectors (already partly split — complete the pattern).
3. **`cli.ts`** becomes: parse top-level **`argv`**, dispatch to **`runCliCommand(kind, …)`**.
4. Keep **`WorkspaceKitCliOptions`** type in **`cli/types.ts`** if it grows.

---

## Task links

| Link | Purpose |
| --- | --- |
| **REF-002** | CAE **`mergeCaeIntoCommandResult`** touchpoints stay in **`run`** layer |
| **`.ai/AGENT-CLI-MAP.md`** | **No drift** — if user-visible messages change, update machine canon |

---

## Acceptance criteria

- [ ] **`pnpm run build`** / **`pnpm run test`** pass.
- [ ] **Manual smoke**: `pnpm exec wk doctor`, `pnpm exec wk run` (bare JSON catalog?), sensitive command **dry** path if safe in CI-less env — document what was run in PR body.
- [ ] **`runCli`** exported API (**`WorkspaceKitCliOptions`**) unchanged for embedders (**`src/index.ts`**).
- [ ] Exit codes match **documented behavior** (**no silent** remap).

---

## create-task payload (starter)

```json
{
  "id": "T###",
  "title": "[REF-007] Layer workspace-kit CLI entry (cli/run/doctor/policy helpers)",
  "status": "proposed",
  "type": "improvement",
  "technicalScope": [
    "Extract helpers from cli.ts and cli/run-command.ts into focused cli/*.ts modules.",
    "Centralize doctor aggregation in cli/doctor/index.ts.",
    "Preserve WorkspaceKitCliOptions and exit code semantics."
  ],
  "acceptanceCriteria": [
    "cli.ts thinner; responsibilities separated by command group.",
    "Tests + smoke commands pass.",
    "AGENT-CLI-MAP/policy copy unchanged unless explicitly fixing a bug."
  ],
  "metadata": {
    "issue": "cli.ts and run-command.ts mix bootstrap, doctor, run pipeline, policy — high coupling.",
    "supportingReasoning": "Line counts + cross-imports indicate extraction will reduce regression risk.",
    "evidenceRefs": ["tasks/refactor-proposals/REF-007-cli-layering.md"]
  }
}
```

---

## Risk & rollback

- **Risk:** Breaking **extension** **`cursor-workflow-cannon`** if it depended on incidental side effects — smoke **`pnpm run ext:compile`** if touched.
- **Rollback:** **`git revert`**.

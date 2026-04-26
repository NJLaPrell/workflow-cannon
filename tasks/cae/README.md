# CAE proposed tasks (task engine + specs)

**Program context:** [`CAE-PROGRAM-CONTEXT.md`](./CAE-PROGRAM-CONTEXT.md)

**Plan snapshot (human triage, may lag `.ai/`):** [`CAE-PLAN-STATUS.md`](./CAE-PLAN-STATUS.md)

**Shared stubs (evolve in early tasks):**

- [`artifacts/stub-effective-activation-bundle.schema.json`](./artifacts/stub-effective-activation-bundle.schema.json)
- [`artifacts/stub-trace-event.schema.json`](./artifacts/stub-trace-event.schema.json)
- [`artifacts/stub-registry-entry.schema.json`](./artifacts/stub-registry-entry.schema.json)
- [`artifacts/cae-read-only-cli-contract.v1.md`](./artifacts/cae-read-only-cli-contract.v1.md) (v1 — **`T847`**; stub redirects)

**Per-task specs:** [`specs/`](./specs/) — one file per `T###` (T837–T869).

**Register in task engine** (after specs exist):

```bash
pnpm run build   # if dist/ is stale
node scripts/cae-register-proposed-tasks.mjs
```

The script reads **`planningGeneration`** from **`get-next-actions`** and passes **`expectedPlanningGeneration`** on each **`create-task`** (required when `tasks.planningGenerationPolicy` is `require`).

Re-run: same `clientMutationId` per task replays idempotently (`task-create-idempotent-replay`). To re-register with new ids, delete tasks or use new mutation ids in the script.

**Historical Phase 70 triage:** Tasks **T837–T869** were triaged to **`ready`** with `phaseKey` **`70`** and label **Phase 70 - Context Activation Engine (CAE)** before implementation. Current status lives in task-engine output; these original rows are completed in the Phase 70 closeout state. Per-task **`metadata.reviewNotes`** holds the accuracy pass (see **`get-task`**). Roadmap section: `src/modules/documentation/data/roadmap-phase-sections.md`.

**Bulk triage script:** `scripts/cae-phase70-triage-accept.mjs` (update-task + `run-transition` **`accept`** with **`policyApproval`** + **`expectedPlanningGeneration`**). Re-run skips non-`proposed` tasks; idempotent **`clientMutationId`** per task for updates/accepts dated `20260408`.

## Index

| ID | Title | Spec | Depends on |
| --- | --- | --- | --- |
| T837 | CAE architecture & boundaries ADR | [T837.md](./specs/T837.md) | — |
| T838 | CAE glossary & TERMS alignment | [T838.md](./specs/T838.md) | T837 |
| T839 | Artifact registry model & ID conventions ADR | [T839.md](./specs/T839.md) | T837 |
| T840 | Activation definition schema v1 | [T840.md](./specs/T840.md) | T839 |
| T841 | Activation lifecycle & versioning | [T841.md](./specs/T841.md) | T840 |
| T842 | Evaluation context contract v1 | [T842.md](./specs/T842.md) | T837 |
| T843 | Precedence, merge & effective bundle semantics | [T843.md](./specs/T843.md) | T840, T842 |
| T844 | Acknowledgement model spec | [T844.md](./specs/T844.md) | T837, T843 |
| T845 | CAE persistence & migration design ADR | [T845.md](./specs/T845.md) | T837 |
| T846 | Trace & explanation surface spec | [T846.md](./specs/T846.md) | T842, T843 |
| T847 | Read-only CAE CLI command contract | [T847.md](./specs/T847.md) | T843, T846 |
| T848 | Shadow mode semantics & observability | [T848.md](./specs/T848.md) | T844, T847 |
| T849 | Runtime integration point (CLI/router design) | [T849.md](./specs/T849.md) | T842, T848 |
| T850 | Advisory activation surfacing design | [T850.md](./specs/T850.md) | T847, T849 |
| T851 | Narrow policy enforcement lane design | [T851.md](./specs/T851.md) | T837, T843, T844 |
| T852 | Activation CRUD mutation governance | [T852.md](./specs/T852.md) | T841, T845 |
| T853 | CAE failure, degradation & recovery | [T853.md](./specs/T853.md) | T845, T849 |
| T854 | CAE test strategy & coverage plan | [T854.md](./specs/T854.md) | T840, T842, T843, T846 |
| T855 | Operator documentation workflow (.ai-first) | [T855.md](./specs/T855.md) | T847, T848 |
| T856 | Future cognitive-map integration contract | [T856.md](./specs/T856.md) | T839, T840, T842 |
| T857 | Bootstrap artifact inventory & registry seed | [T857.md](./specs/T857.md) | T839 |
| T858 | Implement registry loader & validation | [T858.md](./specs/T858.md) | T839, T840, T857 |
| T859 | Implement context builder | [T859.md](./specs/T859.md) | T842 |
| T860 | Implement evaluation engine (bundle + conflicts) | [T860.md](./specs/T860.md) | T841, T843, T844, T858, T859 |
| T861 | Read-only CLI: list/get artifacts & activations | [T861.md](./specs/T861.md) | T847, T857, T858 |
| T862 | Read-only CLI: evaluate, explain, health, conflicts, trace | [T862.md](./specs/T862.md) | T846, T847, T859, T860 |
| T863 | Shadow mode in evaluate/explain pipeline | [T863.md](./specs/T863.md) | T848, T860, T862 |
| T864 | Integrate shadow CAE into pre-command runtime | [T864.md](./specs/T864.md) | T849, T863, T859 |
| T865 | Advisory CAE payload surfacing | [T865.md](./specs/T865.md) | T850, T864 |
| T866 | Narrow CAE policy enforcement lane | [T866.md](./specs/T866.md) | T851, T860, T862 |
| T867 | CAE persistence: traces, retention, migrations | [T867.md](./specs/T867.md) | T845, T846, T862 |
| T868 | Governed activation & registry mutations | [T868.md](./specs/T868.md) | T852, T867 |
| T869 | CAE integration test hardening | [T869.md](./specs/T869.md) | T854, T861, T862, T864 |

# Workspace Kit CLI — visual guide

Human-first map of **`workspace-kit`** (`@workflow-cannon/workspace-kit`): **what exists**, **when to use it**, and **which approval lane** applies. For copy-paste invocations and tier tables, keep **`AGENT-CLI-MAP.md`** as the detailed reference; for approval law, see **`POLICY-APPROVAL.md`**.

> **Mermaid diagrams** below render on GitHub and many Markdown viewers. Raw **ASCII** is readable anywhere (terminal, plain editors).

---

## Topology at a glance (ASCII)

```
                    workspace-kit
                          │
    ┌─────────────────────┼─────────────────────┐
    │                     │                     │
  doctor                  run                  config
  (health +               │                 (get/set/list/…
   optional JSON           │                  effective config)
   catalog)                │
    │                     │
    │            ┌──────────┴──────────┐
    │            │  Module command     │
    │            │  router: one JSON   │
    │            │  payload per call     │
    │            └──────────┬──────────┘
    │                       │
    │     workspace-config • documentation • agent-behavior
    │     task-engine • approvals • planning • improvement
    │
 init ───────── upgrade ───────── check ───────── drift-check
 (profile         (kit-owned       (profile        (managed
  artifacts)       paths +          shape only)    assets vs
                   backups)                        expected)
```

**Invocation shape (the part everyone trips on):**

```bash
workspace-kit run <subcommand> '<single-json-object>'
#                    ^^^^^^^^^    ^^^^^^^^^^^^^^^^^^^
#                    router      third argv = entire payload (often policyApproval here)
```

List executable subcommands (depends on enabled modules):

```bash
workspace-kit run
```

---

## Top-level commands (flow)

```mermaid
flowchart TB
  WK(["workspace-kit"])

  WK --> doctor["doctor"]
  WK --> run["run · subcommand · JSON payload"]
  WK --> config["config …"]
  WK --> init["init"]
  WK --> upgrade["upgrade"]
  WK --> check["check"]
  WK --> drift["drift-check"]

  doctor --> d1["Validates canonical contract files + planning persistence hints"]
  doctor --> d2["Optional: --agent-instruction-surface → JSON catalog on stdout"]

  run --> r1["Dispatches to registered module handlers"]
  r1 --> r2["See module router diagram below"]

  config --> c1["Reads effective layered config"]
  c1 --> c2["Mutations require env WORKSPACE_KIT_POLICY_APPROVAL"]

  init --> i1["Regenerates profile-driven artifacts"]
  upgrade --> u1["Updates kit-owned paths with backups"]

  check --> k1["Profile validation only (lighter than doctor)"]
  drift --> z1["Compares managed assets to expected content"]

  classDef mut fill:#2d3748,stroke:#81e6d9,color:#e2e8f0
  classDef router fill:#1a365d,stroke:#63b3ed,color:#ebf8ff
  classDef read fill:#22543d,stroke:#9ae6b4,color:#f0fff4

  class init,upgrade,config mut
  class run router
  class doctor,check,drift read
```

---

## When should the agent reach for the CLI? (decision)

```mermaid
flowchart TD
  Q{Touching kit-owned state, task lifecycle,\npolicy traces, approvals, doc generation\noutputs, or workspace config?}

  Q -->|No| CODEFLOW["Edit application / tests / docs\nwith normal git + PR workflow."]
  Q -->|Yes| BOOT["1) workspace-kit doctor\n2) workspace-kit run  (no subcommand)\n3) AGENT-CLI-MAP + instructions/*.md"]

  BOOT --> KIND{What kind of change?}

  KIND -->|Task status / transitionLog| TIERA["Tier A: run run-transition\n+ JSON policyApproval"]
  KIND -->|Sensitive run: doc batch, recommendations,\ntranscripts, approvals review, …| TIERB["Tier B: that run subcommand\n+ JSON policyApproval"]
  KIND -->|init / upgrade / config set| ENV["Env: WORKSPACE_KIT_POLICY_APPROVAL\n(not the run JSON field)"]
  KIND -->|Queue discovery, planning, advisory\nbehavior, many task CRUD paths| TIERC["Tier C: usually no policyApproval\n(unless extraSensitiveModuleCommands)"]

  classDef stop fill:#742a2a,stroke:#fc8181,color:#fff5f5
  classDef go fill:#22543d,stroke:#9ae6b4,color:#f0fff4
  classDef warn fill:#744210,stroke:#fbd38d,color:#fffff0

  class Q,KIND warn
  class CODEFLOW go
  class TIERA,TIERB,ENV stop
```

**Editor `/qt` reminder:** templates under `tasks/*.md` do **not** execute the CLI. If a step persists kit state, the agent must run the matching **`workspace-kit`** line from **`AGENT-CLI-MAP.md`** (or the module instruction file).

---

## Approval lanes (two doors — do not mix them)

```mermaid
flowchart LR
  subgraph ENV["Environment gate"]
    E["WORKSPACE_KIT_POLICY_APPROVAL — JSON in env var"]
    E --> E1["workspace-kit init"]
    E --> E2["workspace-kit upgrade"]
    E --> E3["workspace-kit config … (mutations)"]
  end

  subgraph JSON["Third-argument JSON gate"]
    J["policyApproval field inside run JSON string"]
    J --> J1["workspace-kit run run-transition …"]
    J --> J2["workspace-kit run … other Tier B …"]
  end

  subgraph NOTE["Not valid for workspace-kit run"]
    N["Using only chat approval\nor env var instead of JSON\nfor run → denial / trace"]
  end

  classDef env fill:#553c9a,stroke:#b794f4,color:#faf5ff
  classDef json fill:#9c4221,stroke:#f6ad55,color:#fffaf0
  classDef bad fill:#1a202c,stroke:#718096,color:#e2e8f0

  class E,E1,E2,E3 env
  class J,J1,J2 json
  class N bad
```

**Wrong-lane recovery:** If you exported **`WORKSPACE_KIT_POLICY_APPROVAL`** but invoked **`workspace-kit run …`** without **`policyApproval`** in the JSON string, the denial JSON explains that the env gate does not apply to `run`. Fix: pass `policyApproval` in the third argument, or use **`init` / `upgrade` / `config`** for env-based approval — see [`POLICY-APPROVAL.md`](./POLICY-APPROVAL.md#two-approval-surfaces-do-not-mix-them-up).

---

## `workspace-kit run` — default module bundle (router order)

Registration order from `defaultRegistryModules` (affects merge / discovery; not every module owns `run` commands):

```mermaid
flowchart LR
  RUN["run"]

  RUN --> M1["workspace-config"]
  RUN --> M2["documentation"]
  RUN --> M3["agent-behavior"]
  RUN --> M4["task-engine"]
  RUN --> M5["approvals"]
  RUN --> M6["planning"]
  RUN --> M7["improvement"]

  M1 -.-> H1["resolve-config, explain-config, …"]
  M2 -.-> H2["document-project, generate-document, …"]
  M3 -.-> H3["behavior profiles + interview"]
  M4 -.-> H4["tasks, wishlist, transitions, …"]
  M5 -.-> H5["approval queue …"]
  M6 -.-> H6["build-plan, planning explain, …"]
  M7 -.-> H7["recommendations, transcripts, …"]

  classDef mod fill:#234e52,stroke:#4fd1c5,color:#e6fffa
  class M1,M2,M3,M4,M5,M6,M7 mod
```

Exact subcommand names and JSON fields: **`workspace-kit run`** (no args) and per-module **`src/modules/<module>/instructions/<command>.md`**.

---

## Session opener (habit, Tier C)

```bash
workspace-kit doctor
workspace-kit run get-next-actions '{}'
# optional: workspace-kit run get-task '{"taskId":"T###"}'
```

---

## Canonical links

| Need | Doc |
| --- | --- |
| Tier tables + copy-paste | [`AGENT-CLI-MAP.md`](./AGENT-CLI-MAP.md) |
| Approval semantics | [`POLICY-APPROVAL.md`](./POLICY-APPROVAL.md) |
| Agent operating rules | [`AGENTS.md`](./AGENTS.md) |
| System architecture | [`ARCHITECTURE.md`](./ARCHITECTURE.md) |
| Terminology | [`TERMS.md`](./TERMS.md) |

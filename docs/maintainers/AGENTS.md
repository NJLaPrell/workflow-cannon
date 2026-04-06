# AGENTS (maintainers)

**Audience:** Humans maintaining Workflow Cannon. **Not** the coding-agent bootstrap.

**Agents** — repo-root **`AGENTS.md`** → **`.ai/AGENTS.md`**, **`.ai/agent-source-of-truth-order.md`**, **`src/modules/*/instructions/*.md`**, and **`pnpm run wk`** output. Do **not** use this file for agent precedence; see **`.cursor/rules/agent-doc-routing.mdc`**.

**Names:** The repo/product is **Workflow Cannon**; the published CLI package is **`@workflow-cannon/workspace-kit`**, invoked as **`workspace-kit`** or **`wk`** ([`README.md`](../../README.md) → Names).

## Maintainer source-of-truth order (human prose)

Use this stack when **editing** maintainer documentation or reconciling narrative drift. Agents use **`.ai/agent-source-of-truth-order.md`** instead.

1. `.ai/PRINCIPLES.md` — goals, trade-off order, approval gates (machine dialect; human companion in governance docs)
2. `.ai/module-build.md` — module development contracts
3. `docs/maintainers/ROADMAP.md` — phase strategy and release cadence
4. Canonical task-engine state (default: SQLite `.workspace-kit/tasks/workspace-kit.db`; JSON opt-out: `.workspace-kit/tasks/state.json`) — execution queue (**`status`** and **`id`** are authoritative)
5. `docs/maintainers/data/workspace-kit-status.yaml` — `current_kit_phase` maintainer snapshot
6. `docs/maintainers/RELEASING.md` — release gates and evidence
7. `docs/maintainers/POLICY-APPROVAL.md` — approval lanes for `workspace-kit run` vs `config` / `init` / `upgrade`
8. `docs/maintainers/AGENT-CLI-MAP.md` — tier table and copy-paste JSON; visual companion [`CLI-VISUAL-GUIDE.md`](./CLI-VISUAL-GUIDE.md)
9. `docs/maintainers/TERMS.md` — terminology
10. `docs/maintainers/module-build-guide.md` — human module development companion

**Conflict resolution:** Higher entries win for governance and process. Narrative map: [`ARCHITECTURE.md`](./ARCHITECTURE.md) → Documentation precedence.

## Documentation tiers (progressive disclosure)

- **T0** — This file through **CLI-first execution** (below): pick the next maintainer doc without unsafe shortcuts.
- **T1** — Playbooks, runbooks, **ARCHITECTURE**, **AGENT-CLI-MAP**, **CLI-VISUAL-GUIDE**, module guides, and **`.ai/`** machine contracts.

## Canonical, generated, and mirrored docs

| Kind | Where | Notes |
| --- | --- | --- |
| Canonical maintainer prose | `docs/maintainers/*.md` | Primary edits for process and strategy **except** paths emitted by the Phase 56 `.ai` → `docs` pipeline (see below). |
| `.ai` → `docs` pipeline (Phase 56) | `.ai/workbooks/`, `.ai/runbooks/`, `.ai/playbooks/` → matching `docs/maintainers/` | [`data/ai-to-docs-coverage.json`](./data/ai-to-docs-coverage.json) is the manifest; run **`pnpm run generate-maintainer-docs-from-ai`** after editing sources. See [`adrs/ADR-ai-canonical-maintainer-docs-pipeline.md`](./adrs/ADR-ai-canonical-maintainer-docs-pipeline.md). |
| Machine / generated | `.ai/*.md` | Agent-first; some outputs are **generated** by the documentation module. |
| Cursor enforcement | `.cursor/rules/*.mdc` | Pointer-first; see **module-build-guide** → Cursor rules. |

### Maintainer mirror pairing (human vs `.ai/`)

- **Editing:** When content exists under both **`docs/maintainers/`** and **`.ai/`**, follow **ADR-ai-canonical-maintainer-docs-pipeline** and **module-build-guide** → workbook / mirror pairing.
- **Workbooks (covered set):** Canonical **`.ai/workbooks/`**; human renders under **`docs/maintainers/workbooks/`** are **generated** where covered.
- **Config reference:** **`CONFIG.md`** pairs (`.ai/` + `docs/`) are generated from **`src/core/config-metadata.ts`**; do not hand-edit.

## Maintainer task templates (`tasks/*.md`)

Prompt-only; they do **not** run **`workspace-kit`**. Steps that persist kit state must include the matching **`workspace-kit`** line from **`docs/maintainers/AGENT-CLI-MAP.md`**.

## Maintainer playbooks (direction sets)

Generated from **`.ai/playbooks/`** where covered — edit **`.ai`** sources, then **`pnpm run generate-maintainer-docs-from-ai`**. Authoring rules: [`playbooks/README.md`](./playbooks/README.md). Terminology: [`TERMS.md`](./TERMS.md).

| Playbook id | Path | Use when |
| --- | --- | --- |
| `phase-closeout-and-release` | [`playbooks/phase-closeout-and-release.md`](./playbooks/phase-closeout-and-release.md) | Phase closeout, release, evidence |
| `task-to-phase-branch` | [`playbooks/task-to-phase-branch.md`](./playbooks/task-to-phase-branch.md) | Single **`T###`** → PR → **`release/phase-<N>`** |
| `improvement-task-discovery` | [`playbooks/improvement-task-discovery.md`](./playbooks/improvement-task-discovery.md) | Research → log improvements |
| `improvement-scout` | [`playbooks/improvement-scout.md`](./playbooks/improvement-scout.md) | Bounded scout / **`scout-report`** |
| `improvement-triage-top-three` | [`playbooks/improvement-triage-top-three.md`](./playbooks/improvement-triage-top-three.md) | **`proposed`** → **`ready`** (≤3) |
| `wishlist-intake-to-execution` | [`playbooks/wishlist-intake-to-execution.md`](./playbooks/wishlist-intake-to-execution.md) | Wishlist → **`convert-wishlist`** |
| `skill-attachments` | [`playbooks/skill-attachments.md`](./playbooks/skill-attachments.md) | **`metadata.skillIds`** |
| `workspace-kit-chat-onboarding` | [`playbooks/workspace-kit-chat-onboarding.md`](./playbooks/workspace-kit-chat-onboarding.md) | **`/onboarding`** |
| `workspace-kit-chat-behavior-interview` | [`playbooks/workspace-kit-chat-behavior-interview.md`](./playbooks/workspace-kit-chat-behavior-interview.md) | **`/behavior-interview`** |

Invocation / Cursor attachment: [`runbooks/agent-playbooks.md`](./runbooks/agent-playbooks.md). Agent-oriented copy: **`.ai/runbooks/agent-playbooks.md`**.

**Optional Cursor rules:** `playbook-phase-closeout.mdc`, `playbook-task-to-phase-branch.mdc`, `playbook-improvement-task-discovery.mdc`, `playbook-improvement-triage-top-three.mdc`, `playbook-wishlist-intake-to-execution.mdc`, `playbook-workspace-kit-chat-onboarding.mdc`, `playbook-workspace-kit-chat-behavior-interview.mdc` (under `.cursor/rules/`).

## Long threads and context reload

**Maintainers:** narrative in [`runbooks/cursor-long-session.md`](./runbooks/cursor-long-session.md). **Agents:** **`.ai/runbooks/cursor-long-session.md`** and **`.cursor/rules/cursor-long-session-hygiene.mdc`**.

1. Run **`workspace-kit doctor`**, then **`workspace-kit run get-next-actions '{}'`**.
2. Re-read **`docs/maintainers/data/workspace-kit-status.yaml`** and task rows via **`list-tasks`** / **`get-task`** as needed.

## Core expectations

- High autonomy when intent is clear; soft-gate on principle conflicts; stop on irreversible harm without approval.
- Explicit human confirmation before release execution, migration/upgrade-path changes, and policy/approval-model changes.
- Prefer small, reversible, evidence-backed changes.

## Working rules

- **`pnpm run check`** — includes governance path-order snapshot vs **`.ai/agent-source-of-truth-order.md`**; update **`scripts/fixtures/governance-doc-order.json`** when agent precedence changes intentionally.
- Strategy in **`ROADMAP.md`**, execution in task-engine state, release process in **`RELEASING.md`**.
- When scope changes, update related docs in the same change set.

## CLI-first execution (kit-owned state)

Before mutating task-engine state, policy traces, approvals, transcript/improvement stores, or doc generation outputs, run the matching **`workspace-kit`** command. Approval for **`run`**: [`POLICY-APPROVAL.md`](./POLICY-APPROVAL.md). **Agents** should use **`.ai/POLICY-APPROVAL.md`** and **`.ai/AGENT-CLI-MAP.md`** for the same law without opening long `docs/` prose unless editing it.

- Bootstrap: `workspace-kit doctor`, `workspace-kit run` (no subcommand), then **AGENT-CLI-MAP** (or **`.ai/AGENT-CLI-MAP.md`**).
- Do **not** hand-edit **`state.json`** for routine transitions; use **`run-transition`**.

### Native SQLite consumer troubleshooting

[`runbooks/native-sqlite-consumer-install.md`](./runbooks/native-sqlite-consumer-install.md); ADR: [`adrs/ADR-native-sqlite-consumer-distribution.md`](./adrs/ADR-native-sqlite-consumer-distribution.md).

### Example commands

**Task transition**

```bash
workspace-kit run run-transition '{"taskId":"T285","action":"start","policyApproval":{"confirmed":true,"rationale":"start work on task"}}'
```

**Sensitive `run`**

```bash
workspace-kit run generate-recommendations '{"policyApproval":{"confirmed":true,"rationale":"improvement pass"}}'
```

**`config` / `init` / `upgrade`**

```bash
export WORKSPACE_KIT_POLICY_APPROVAL='{"confirmed":true,"rationale":"adjust cadence"}'
workspace-kit config set improvement.cadence.minIntervalMinutes 30 --json
```

## Workspace phase snapshot

See **`docs/maintainers/data/workspace-kit-status.yaml`**. Mutate via **`workspace-kit run update-workspace-phase-snapshot`** (see **`src/modules/task-engine/instructions/update-workspace-phase-snapshot.md`**). Recovery-only hand edits per [`playbooks/phase-closeout-and-release.md`](./playbooks/phase-closeout-and-release.md).

## Agent behavior profiles (advisory)

`workspace-kit run resolve-behavior-profile`, `interview-behavior-profile` — see **AGENT-CLI-MAP** (Tier C). **`.cursor/rules/agent-behavior.mdc`**.

## Task execution, improvement discovery, triage

Same workflows as before; **agents** follow **`.ai/playbooks/*.md`** (sources) or requestable Cursor playbooks. Maintainer rendered copies: **`playbooks/`** links in the table above.

## Documentation generation

- **`document-project`** / **`generate-document`** — see **`src/modules/documentation/RULES.md`** and module **`instructions/`**.

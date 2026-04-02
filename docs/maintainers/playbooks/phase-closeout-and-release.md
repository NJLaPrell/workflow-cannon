# Playbook: phase closeout and release

**Playbook id:** `phase-closeout-and-release`  
**Use when:** Closing a numbered phase and cutting a GitHub + npm release for `@workflow-cannon/workspace-kit`.

This file is an **ordered checklist**. Canonical prose lives in the linked docs — do not treat this as a fork of [`RELEASING.md`](../RELEASING.md).

## 0) Attach context

- Confirm [`docs/maintainers/TERMS.md`](../TERMS.md) vocabulary (task-engine state, approval gates, evidence).
- For **policy-sensitive** `workspace-kit run` commands, use JSON **`policyApproval`** on the **third** CLI argument; for `config` / `init` / `upgrade`, see [`POLICY-APPROVAL.md`](../POLICY-APPROVAL.md).

## 1) Refresh execution state (read-only discovery)

1. `workspace-kit doctor`
2. `workspace-kit run get-next-actions '{}'`
3. Optional: `workspace-kit run list-tasks '{}'` filtered as needed.

Do **not** infer task `status` from chat memory — the configured task store (default SQLite `.workspace-kit/tasks/workspace-kit.db`) is authoritative.

## 2) Finish remaining phase work (delivery loop)

Follow the **maintainer delivery loop** (feature branch per coherent slice, validate, PR, merge, then task transitions):

- Cursor rule mirror: `.cursor/rules/maintainer-delivery-loop.mdc`
- Human-oriented summary: [`docs/maintainers/AGENTS.md`](../AGENTS.md) (task execution + CLI-first execution)

**Task lifecycle mutations** use Tier A from [`AGENT-CLI-MAP.md`](../AGENT-CLI-MAP.md) — **no** hand-editing lifecycle in `state.json` except documented recovery.

Copy-paste pattern (replace `T###`, rationale, and action):

```bash
workspace-kit run run-transition '{"taskId":"T###","action":"start","policyApproval":{"confirmed":true,"rationale":"begin task work"}}'
```

```bash
workspace-kit run run-transition '{"taskId":"T###","action":"complete","policyApproval":{"confirmed":true,"rationale":"acceptance criteria met"}}'
```

## 3) Human gate — stop before publish

**Do not** run publish automation or tag-driven release actions until a human explicitly approves, per [`RELEASING.md`](../RELEASING.md) (“Present for approval”).

Summarize scope, risk, validation evidence, and migration notes; obtain **explicit** confirmation to proceed with publish.

## 4) Release procedure (execute per RELEASING)

Run the full **Release procedure** in [`RELEASING.md`](../RELEASING.md): define scope, prepare artifacts (changelog + `package.json` version), run validation commands (`build`, `check`, `test`, `parity`, `check-release-metadata`, `pre-merge-gates` — alias: `phase5-gates`, doc consistency sweep), **then** publish after approval, then record evidence (tag, workflow run URL, npm).

Tier **B** `workspace-kit run` commands (non-transition) also require JSON `policyApproval` — see [`AGENT-CLI-MAP.md`](../AGENT-CLI-MAP.md) and [`POLICY-APPROVAL.md`](../POLICY-APPROVAL.md).

## 5) After publish

- Capture release evidence per [`RELEASING.md`](../RELEASING.md) → **Required release evidence**.
- Update maintainer snapshots (for example [`docs/maintainers/ROADMAP.md`](../ROADMAP.md), [`docs/maintainers/data/workspace-kit-status.yaml`](../data/workspace-kit-status.yaml)) when the phase closeout task requires it.
- Bump **`current_kit_phase`** / **`next_kit_phase`** via **`workspace-kit run update-workspace-phase-snapshot`** (and align **`kit.currentPhaseNumber`** in config when used) so **`doctor`** stays green — see [`AGENTS.md`](../AGENTS.md) → **Workspace phase snapshot**.

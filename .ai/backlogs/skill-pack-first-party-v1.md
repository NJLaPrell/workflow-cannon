meta|doc=backlog|truth=canonical|schema=base.v2|status=active|profile=skills

project|name=workflow-cannon|type=skill_pack_backlog|scope=repo
epic|id=skill-pack-first-party-v1|phase=109|status=active

# First-party Workflow Cannon skill pack backlog (v1)

Machine backlog for **Claude-shaped** skill trees under **`.claude/skills/<id>/SKILL.md`**. Kit discovery uses **`skills.discoveryRoots`** (default **`.claude/skills`**). Cursor agents also benefit when the same trees exist under **`.cursor/skills/`** (copy, symlink, or extra discovery root).

**Related canon:** `.ai/runbooks/skill-packs-dual-install.md`, `.ai/playbooks/skill-attachments.md`, `PROJECT_TOOLS.md` (§ Workflow Cannon Skill Pack).

## Goals

1. **Selection-quality descriptions** — frontmatter `description` must say *when* to load the skill (Cursor/Claude selection is description-driven).
2. **Thin bodies, thick canon** — `SKILL.md` body = when-to-use + ordered steps + links to **`.ai/playbooks/*.md`** and **`.ai/AGENT-CLI-MAP.md`**; do not fork playbook prose into skills (drift risk).
3. **`recommend-skills` alignment** — every pack includes shared tag **`workflow-cannon`**; workflow tags below; optional **`task-type:workspace-kit`** on execution/maintainer packs.
4. **`metadata.skillIds`** — attach 1–3 ids on **`T###`** rows via **`create-task`** / **`update-task`** (see § Task attachment matrix).

## Discovery and dual install

| Surface | Path | Notes |
| --- | --- | --- |
| Kit `list-skills` | `.claude/skills/<id>/` | **Canonical** for `recommend-skills`, `apply-skill`, task validation |
| Cursor agent skills | `.cursor/skills/<id>/` | Mirror or symlink from `.claude/skills` for IDE selection |
| Existing Cursor-only | `.cursor/skills/task-flow-subagent-delivery/` | **Migrate** body into `wc-task-delivery` under `.claude/skills/`; keep Cursor path as symlink |

**Recommended workspace config** (after Wave 1 ships):

```json
{
  "skills": {
    "discoveryRoots": [".claude/skills", ".cursor/skills"]
  }
}
```

## Tag contract (`recommend-skills`)

- **`tags` in argv:** every listed tag must appear on the pack’s `discoveryTags` (from YAML `tags:` frontmatter).
- **Implicit filters:** `phaseKey` → pack must include `phase:<key>`; `taskType` → pack must include `task-type:<type>`.

**Shared tags (all packs):** `workflow-cannon`

**Workflow tags (pick 1–3 per pack):** `delivery`, `release`, `task`, `improvement`, `ideas`, `planning`, `dashboard`, `docs`, `policy`, `bootstrap`, `phase-journal`, `transcript`

**Task-type tags (maintainer execution packs):** `task-type:workspace-kit`

## SKILL.md body template (all packs)

```markdown
---
name: <Human title>
description: <One sentence: WHEN to use — include trigger words agents match on>
tags: workflow-cannon, <workflow-tags>, ...
---

# <id>

## When to use

- Bullet triggers (3–5).

## Canon (read first)

- `.ai/playbooks/<playbook-id>.md` — primary checklist
- `.ai/<other>.md` — only if needed

## Steps (summary)

1. Numbered echo of playbook § order (max 12 steps); each step names CLI or doc anchor.
2. …

## Kit commands

- Discover: `pnpm exec wk run list-skills '{}'`
- Apply body: `pnpm exec wk run apply-skill '{"skillId":"<id>"}'` (preview default)
- Attach to task: `metadata.skillIds: ["<id>"]`

## Do not

- Hand-edit `.workspace-kit/tasks/workspace-kit.db` for lifecycle.
- Treat chat approval as `policyApproval` on `wk run`.
```

## Master inventory

| Wave | id | Priority | Playbook / canon source | Primary `metadata.skillIds` use |
| --- | --- | --- | --- | --- |
| 1 | `wc-agent-bootstrap` | P0 | `.ai/WORKSPACE-KIT-SESSION.md`, `.ai/AGENT-CLI-MAP.md` | Any session / investigation task |
| 1 | `wc-policy-cli` | P0 | `.ai/POLICY-APPROVAL.md`, `.ai/AGENT-CLI-MAP.md` | Tier A/B mutation tasks |
| 1 | `wc-task-author` | P0 | `create-task` instruction, `.ai/playbooks/skill-attachments.md` | New `T###` / intake |
| 1 | `wc-task-delivery` | P0 | `.ai/playbooks/task-to-phase-branch.md`, `.ai/MACHINE-PLAYBOOKS.md` | Active delivery `T###` |
| 2 | `wc-pr-review` | P1 | `.cursor/rules/pr-review-merge-strategy.mdc` (requestable), maintainer delivery loop | Review / merge tasks |
| 2 | `wc-release-captain` | P1 | `.ai/playbooks/phase-closeout-and-release.md`, `.ai/RELEASING.md` | Phase closeout / release |
| 2 | `wc-improvement-discovery` | P1 | `.ai/playbooks/improvement-task-discovery.md` | `improvement` research tasks |
| 2 | `wc-improvement-triage` | P1 | `.ai/playbooks/improvement-triage-top-three.md` | Backlog promotion |
| 3 | `wc-planner-chat` | P1 | `.ai/playbooks/planner-chat.md` | Ideas → PlanArtifact → execution |
| 3 | `wc-transcript-churn` | P2 | `.ai/playbooks/transcript-churn-research.md` | `transcript_churn` / research |
| 3 | `wc-dashboard-operator` | P2 | `.ai/DASHBOARD-POLICY-UX.md`, extension dashboard | UI/policy from dashboard |
| 3 | `wc-doc-governance` | P2 | `src/modules/documentation/RULES.md`, `.cursor/rules/agent-doc-routing.mdc` | Doc generation / drift |
| 3 | `wc-agent-doc-routing` | P2 | `.cursor/rules/agent-doc-routing.mdc`, `.ai/agent-source-of-truth-order.md` | Exploratory / planning agents |
| 3 | `wc-phase-journal` | P2 | `.ai/runbooks/phase-journal-dashboard-signal.md`, phase note instructions | Phase notes / journal |

**Deprecate / merge:** `sample-wc-skill` stays as kit fixture; `task-flow-subagent-delivery` → **`wc-task-delivery`**.

---

## Per-pack specifications

### `wc-agent-bootstrap` (Wave 1, P0)

| Field | Value |
| --- | --- |
| **displayName** | Workflow Cannon session bootstrap |
| **description** | Use at the start of a Workflow Cannon session or after context loss: run doctor, agent-bootstrap or get-next-actions, read planning generation before any mutating wk run. |
| **tags** | `workflow-cannon`, `bootstrap`, `task-type:workspace-kit` |
| **Playbooks** | — (canon docs only) |
| **Canon links** | `.ai/WORKSPACE-KIT-SESSION.md`, `.ai/agent-source-of-truth-order.md`, `.ai/AGENT-CLI-MAP.md` (Tier table) |
| **Body focus** | Cold-start checklist; `pnpm exec wk doctor`; `pnpm exec wk run agent-bootstrap '{}'`; never read `docs/maintainers/ROADMAP.md` for queue facts |

---

### `wc-policy-cli` (Wave 1, P0)

| Field | Value |
| --- | --- |
| **displayName** | Workflow Cannon policy and Tier A/B CLI |
| **description** | Use before any workspace-kit run that changes tasks, releases, policy, or applies skills with audit: JSON policyApproval in argv; env var is not valid for wk run. |
| **tags** | `workflow-cannon`, `policy`, `task-type:workspace-kit` |
| **Playbooks** | — |
| **Canon links** | `.ai/POLICY-APPROVAL.md`, `.ai/AGENT-CLI-MAP.md`, `.ai/machine-cli-policy.md` |
| **Body focus** | Two approval surfaces; copy-paste Tier A/B blocks; `run-transition` + `expectedPlanningGeneration` when require |

---

### `wc-task-author` (Wave 1, P0)

| Field | Value |
| --- | --- |
| **displayName** | Workflow Cannon task author |
| **description** | Use when creating or shaping a T### task: create-task, intake fields, phaseKey, optional metadata.skillIds, resolve-task-intake-policy before ready. |
| **tags** | `workflow-cannon`, `task`, `task-type:workspace-kit` |
| **Playbooks** | `.ai/playbooks/skill-attachments.md` |
| **Canon links** | `src/modules/task-engine/instructions/create-task.md`, `.ai/AGENT-CLI-MAP.md` |
| **Body focus** | `allocateId` vs explicit id; improvement type guardrails; attach skills via `list-skills` |

---

### `wc-task-delivery` (Wave 1, P0)

| Field | Value |
| --- | --- |
| **displayName** | Workflow Cannon single-task delivery |
| **description** | Use when delivering one T### via release/phase branch: branch, run-transition start before first commit, PR to phase branch, merge, complete with evidence. |
| **tags** | `workflow-cannon`, `delivery`, `task-type:workspace-kit` |
| **Playbooks** | `.ai/playbooks/task-to-phase-branch.md` |
| **Canon links** | `.ai/MACHINE-PLAYBOOKS.md`, `.ai/playbooks/task-to-phase-branch.md`, `.ai/POLICY-APPROVAL.md` |
| **Body focus** | Replace `.cursor/skills/task-flow-subagent-delivery`; same content under `.claude/skills/wc-task-delivery/` |
| **Suggested default skillIds on delivery tasks** | `["wc-task-delivery","wc-policy-cli"]` |

---

### `wc-pr-review` (Wave 2, P1)

| Field | Value |
| --- | --- |
| **displayName** | Workflow Cannon PR review |
| **description** | Use when reviewing or merging a maintainer PR for Workflow Cannon: follow-up commits not amend+force; checks green; task store complete only after run-transition. |
| **tags** | `workflow-cannon`, `delivery`, `task-type:workspace-kit` |
| **Playbooks** | — (rules + delivery loop) |
| **Canon links** | `.cursor/rules/maintainer-delivery-loop.mdc`, `.cursor/rules/pr-review-merge-strategy.mdc`, `.ai/MACHINE-PLAYBOOKS.md` |
| **Body focus** | `gh pr`; pre-merge-gates; PR ≠ task complete |

---

### `wc-release-captain` (Wave 2, P1)

| Field | Value |
| --- | --- |
| **displayName** | Workflow Cannon release captain |
| **description** | Use when closing a phase or cutting a release: phase branch to main, human approval before publish, RELEASING evidence and parity checks. |
| **tags** | `workflow-cannon`, `release`, `task-type:workspace-kit` |
| **Playbooks** | `.ai/playbooks/phase-closeout-and-release.md` |
| **Canon links** | `.ai/RELEASING.md`, `.ai/MACHINE-PLAYBOOKS.md` |
| **Body focus** | §7 phase journal summary; explicit human gate before release execution |

---

### `wc-improvement-discovery` (Wave 2, P1)

| Field | Value |
| --- | --- |
| **displayName** | Workflow Cannon improvement discovery |
| **description** | Use when researching friction and logging improvement tasks: problem report with metadata.issue and supportingReasoning, Tier B persistence, not GitHub Issues. |
| **tags** | `workflow-cannon`, `improvement`, `task-type:workspace-kit` |
| **Playbooks** | `.ai/playbooks/improvement-task-discovery.md` |
| **Canon links** | `.ai/MACHINE-PLAYBOOKS.md`, `src/modules/task-engine/instructions/create-task.md` |
| **Body focus** | Scout vs full discovery; `create-task` proposed status |

---

### `wc-improvement-triage` (Wave 2, P1)

| Field | Value |
| --- | --- |
| **displayName** | Workflow Cannon improvement triage |
| **description** | Use when promoting at most three proposed improvement tasks to ready: bounded accept with policyApproval and documented rationale. |
| **tags** | `workflow-cannon`, `improvement`, `task-type:workspace-kit` |
| **Playbooks** | `.ai/playbooks/improvement-triage-top-three.md` |
| **Canon links** | `.ai/AGENT-CLI-MAP.md` (accept transition) |
| **Body focus** | ≤3 rule; evidence-backed promotion |

---

### `wc-planner-chat` (Wave 3, P1)

| Field | Value |
| --- | --- |
| **displayName** | Workflow Cannon planner chat |
| **description** | Use when an Ideas row should become a PlanArtifact draft and phased execution tasks with planning generation hygiene. |
| **tags** | `workflow-cannon`, `ideas`, `planning`, `task-type:workspace-kit` |
| **Playbooks** | `.ai/playbooks/planner-chat.md` |
| **Canon links** | `create-idea` / `finalize-plan-to-phase` via CLI map |
| **Body focus** | Dashboard Ideas flows optional cross-link |

---

### `wc-transcript-churn` (Wave 3, P2)

| Field | Value |
| --- | --- |
| **displayName** | Workflow Cannon transcript churn research |
| **description** | Use for transcript_churn research rows: investigate, then synthesize-transcript-churn or reject via run-transition. |
| **tags** | `workflow-cannon`, `transcript`, `improvement`, `task-type:workspace-kit` |
| **Playbooks** | `.ai/playbooks/transcript-churn-research.md` |
| **Canon links** | `.ai/MACHINE-PLAYBOOKS.md` |
| **Body focus** | Pairs with dashboard research chat prefill |

---

### `wc-dashboard-operator` (Wave 3, P2)

| Field | Value |
| --- | --- |
| **displayName** | Workflow Cannon dashboard operator |
| **description** | Use when driving mutations from the Cursor dashboard webview: routine vs elevated policy tiers, drawer flows, no hand-editing task SQLite. |
| **tags** | `workflow-cannon`, `dashboard` |
| **Playbooks** | — |
| **Canon links** | `.ai/DASHBOARD-POLICY-UX.md`, `.ai/POLICY-APPROVAL.md` (Dashboard section) |
| **Body focus** | Agents on terminal still use `wc-policy-cli`; dashboard auto-rationale vs operator text |

---

### `wc-doc-governance` (Wave 3, P2)

| Field | Value |
| --- | --- |
| **displayName** | Workflow Cannon documentation governance |
| **description** | Use when generating or fixing maintainer or repo docs: document-project and generate-document only; do not hand-edit generated README sections. |
| **tags** | `workflow-cannon`, `docs` |
| **Playbooks** | — |
| **Canon links** | `src/modules/documentation/RULES.md`, `.cursor/rules/agent-doc-routing.mdc` |
| **Body focus** | `.ai/` vs `docs/maintainers/` routing |

---

### `wc-agent-doc-routing` (Wave 3, P2)

| Field | Value |
| --- | --- |
| **displayName** | Workflow Cannon agent doc routing |
| **description** | Use when unsure which docs to read: machine canon under .ai and CLI JSON only; avoid docs/maintainers for routine execution queue facts. |
| **tags** | `workflow-cannon`, `bootstrap`, `docs` |
| **Playbooks** | — |
| **Canon links** | `.ai/agent-source-of-truth-order.md`, `.cursor/rules/agent-doc-routing.mdc` |
| **Body focus** | Complements `wc-agent-bootstrap`; lighter weight |

---

### `wc-phase-journal` (Wave 3, P2)

| Field | Value |
| --- | --- |
| **displayName** | Workflow Cannon phase journal |
| **description** | Use when adding, converting, or triaging phase notes and journal signals for the current kit phase. |
| **tags** | `workflow-cannon`, `phase-journal`, `task-type:workspace-kit` |
| **Playbooks** | — |
| **Canon links** | `.ai/runbooks/phase-journal-dashboard-signal.md`, `src/modules/task-engine/instructions/add-phase-note.md` |
| **Body focus** | `expectedPlanningGeneration` on writes |

---

## Task attachment matrix (`metadata.skillIds`)

Suggested arrays when **creating** tasks (adjust per task; validate with `list-skills`).

| Task kind | Suggested `metadata.skillIds` |
| --- | --- |
| Generic maintainer / agent session | `["wc-agent-bootstrap","wc-agent-doc-routing"]` |
| `workspace-kit` delivery `T###` | `["wc-task-delivery","wc-policy-cli"]` |
| New `T###` authoring | `["wc-task-author","wc-policy-cli"]` |
| PR review / merge follow-up | `["wc-pr-review","wc-task-delivery"]` |
| Phase closeout / release | `["wc-release-captain","wc-policy-cli"]` |
| `improvement` proposed (research) | `["wc-improvement-discovery"]` |
| `improvement` triage promotion | `["wc-improvement-triage","wc-policy-cli"]` |
| Ideas → execution | `["wc-planner-chat","wc-task-author"]` |
| `transcript_churn` / research | `["wc-transcript-churn"]` |
| Documentation / doc-module work | `["wc-doc-governance"]` |
| Dashboard UX / extension | `["wc-dashboard-operator"]` |
| Phase notes only | `["wc-phase-journal"]` |

**Playbook preamble convention** (from `.ai/playbooks/skill-attachments.md`):

```markdown
Suggested skillIds: wc-task-delivery, wc-policy-cli
```

---

## `recommend-skills` cheat sheet

```bash
# Any Workflow Cannon pack
pnpm exec wk run recommend-skills '{"tags":["workflow-cannon"]}'

# Delivery-shaped
pnpm exec wk run recommend-skills '{"tags":["workflow-cannon","delivery"],"taskType":"workspace-kit"}'

# Release / phase closeout
pnpm exec wk run recommend-skills '{"tags":["workflow-cannon","release"]}'

# Improvement backlog work
pnpm exec wk run recommend-skills '{"tags":["workflow-cannon","improvement"],"taskType":"workspace-kit"}'

# New task intake
pnpm exec wk run recommend-skills '{"tags":["workflow-cannon","task"],"taskType":"workspace-kit"}'
```

---

## Implementation waves

### Wave 1 — ship daily driver packs (4 skills)

1. Add `.claude/skills/wc-agent-bootstrap/SKILL.md`
2. Add `.claude/skills/wc-policy-cli/SKILL.md`
3. Add `.claude/skills/wc-task-author/SKILL.md`
4. Add `.claude/skills/wc-task-delivery/SKILL.md` (migrate from `.cursor/skills/task-flow-subagent-delivery/`)
5. Symlink or copy Wave 1 ids to `.cursor/skills/` for Cursor selection
6. Verify: `pnpm exec wk run list-skills '{}'`, `recommend-skills`, `create-task` with sample `skillIds`
7. Optional: extend `skills.discoveryRoots` to include `.cursor/skills`

**Done when:** `list-skills` returns ≥4 first-party ids; delivery playbook tasks can attach `wc-task-delivery`.

### Wave 2 — delivery closure loop (4 skills)

`wc-pr-review`, `wc-release-captain`, `wc-improvement-discovery`, `wc-improvement-triage`

### Wave 3 — intake, UI, docs (5 skills)

`wc-planner-chat`, `wc-transcript-churn`, `wc-dashboard-operator`, `wc-doc-governance`, `wc-agent-doc-routing`, `wc-phase-journal`

### Wave 4 — hygiene

- Update `.ai/playbooks/README.md` index with **Suggested skillIds** column or footnotes per playbook
- Add maintainer render via `generate-maintainer-docs-from-ai` when human twin needed
- Consider task template in task-engine for default `skillIds` by `type` (future — not v1 scope)

---

## Acceptance (epic-level)

- [ ] All Wave 1–2 packs exist under `.claude/skills/<id>/SKILL.md` with valid frontmatter
- [ ] `pnpm exec wk run list-skills '{}'` lists all shipped ids
- [ ] `recommend-skills` returns expected packs for delivery/release/improvement queries above
- [ ] Unknown `metadata.skillIds` still fail closed on create/update
- [ ] `.ai/playbooks/task-to-phase-branch.md` documents `Suggested skillIds: wc-task-delivery, wc-policy-cli`
- [ ] `PROJECT_TOOLS.md` skill pack section points to this backlog as source of truth

---

## Out of scope (v1)

- Replacing `.cursor/rules` (skills complement rules, not replace)
- Embedding full playbook markdown inside `SKILL.md` bodies
- Auto-attaching skills on every `create-task` without explicit metadata (future template work)
- Consumer-repo skill packs (this backlog is **Workflow Cannon repo** first-party only)

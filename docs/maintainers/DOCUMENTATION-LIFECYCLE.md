# Documentation lifecycle taxonomy

**Audience:** Maintainers editing human-facing documentation, generated surfaces, and archives. **Agents:** Use **`.cursor/rules/agent-doc-routing.mdc`** for routine bootstrap; open this file when you are explicitly changing lifecycle policy, maintainer indexes, or reconciling human vs machine doc trees.

This policy names **lifecycle states** for files and directories, where each class **lives** in the repository, and the **metadata** maintainers should record when introducing or retiring material. It does **not** change numeric precedence in **`.ai/agent-source-of-truth-order.md`** or the agent-vs-maintainer routing law — it documents how to classify and place work so those rules stay enforceable.

## Lifecycle states

| State | Meaning |
| --- | --- |
| **Active** | Current truth for its audience; intended for ongoing edits or regeneration from an owned source. |
| **Generated** | Produced by automation (documentation module, pipelines, exports). **Edits** belong in the owning template, config, or `.ai` source — not in the generated artifact except through the generator. |
| **Historical** | Superseded but retained for context (prior ADRs, old playbooks, dated runbooks). Prefer a short pointer from active docs to the historical copy. |
| **Archive candidate** | Stable but unused; no active references. Schedule review for move under an archive tree or deletion. |
| **Delete candidate** | Redundant, wrong, or harmful; remove after a short notice window and link repair, unless policy requires retention. |

## Where material belongs

| Class | Primary location | Notes |
| --- | --- | --- |
| **Agent-first / machine canon** | **`.ai/**/*.md`**, **`.ai/**/*.json`** (indexed contracts), **`src/modules/*/instructions/*.md`** | CLI JSON and instruction payloads are authoritative for execution. |
| **Canonical maintainer prose** | **`docs/maintainers/*.md`** (excluding paths owned by generators — see **ADR-ai-canonical-maintainer-docs-pipeline** and **`data/ai-to-docs-coverage.json`**) | Human strategy, playbooks rendered from `.ai` where covered, governance depth. |
| **Generated maintainer / human mirror** | Paths listed in **`docs/maintainers/data/ai-to-docs-coverage.json`** and outputs of **`pnpm run generate-maintainer-docs-from-ai`** / **`document-project`** | Regenerate after editing `.ai` sources per module rules. |
| **Planning / execution snapshots** | **`docs/maintainers/data/**`** (YAML/JSON exports), task-engine SQLite under **`.workspace-kit/tasks/`** | Machine snapshots and exports; not casual reading for agents (see **`.ai/WORKSPACE-KIT-SESSION.md`**). |
| **Archives** | **`docs/maintainers/archive/**`** (or other explicitly named **`archive/`** trees documented in module READMEs) | Long-retention or tombstone content; link from active docs only when needed. |
| **Human landing / orientation** | Repo-root **`README.md`** (generated per documentation module), **`docs/maintainers/AGENTS.md`**, **`AGENTS.md`** (pointer entry) | Do not hand-edit module-owned **`README.md`** body — use **`.ai/README.md`** + templates per **`.ai/TERMS.md`** / documentation **RULES**. |

**Planning docs** (roadmaps, phase narratives) are **maintainer-canonical** when they are narrative strategy under **`docs/maintainers/`**; **execution queue facts** remain in task-engine state and **`pnpm run wk`** output — agents must not treat roadmap prose as the live queue (see **`.cursor/rules/agent-doc-routing.mdc`**).

## Required metadata for new or moved docs

When adding or substantially moving documentation, record (in the doc front-matter, adjacent README table, or module **RULES** — follow local convention):

| Field | Purpose |
| --- | --- |
| **Audience** | `maintainer`, `agent`, `both`, or `machine-only`. |
| **Owner** | Team or module name responsible for drift (e.g. `task-engine`, `documentation`). |
| **Canonical source** | Path to the editable source of truth (template, `.ai` file, or `docs/maintainers/...`). |
| **Generated** | `yes` / `no` / `partial`; if generated, name the command (`document-project`, `generate-document`, `generate-maintainer-docs-from-ai`). |
| **Replacement path** | Where superseding content lives, if this file is historical. |
| **Deletion condition** | When the file may be removed (e.g. "after two releases with no references"). |

## Promotion and retirement (short process)

1. **Introduce** — Pick the **class** and **state** from the tables above; set metadata.
2. **Mirror** — If `.ai` → `docs` pipeline applies, edit **`.ai`** first, then regenerate per **module-build-guide** / ADR.
3. **Demote** — Move **Active** → **Historical** with a replacement path; update indexes (**`docs/maintainers/AGENTS.md`**, module README).
4. **Archive or delete** — **Archive candidate** → archive tree or **Delete candidate** → remove with link grep and changelog note as required by release policy.

## Documentation ledger (machine inventory)

The repository keeps a **grouped Markdown inventory** in **`docs/maintainers/data/documentation-ledger.v1.json`**: path buckets (`.ai/`, `docs/maintainers/`, module `instructions/`, `tasks/`, etc.), **generated vs hand-maintained** posture, and **per-file dispositions** for repo-root planning and scratch Markdown.

Regenerate after large doc reshuffles:

```bash
pnpm run build:documentation-ledger
```

Maintainer CI (`pnpm run check` → `documentation-data`) asserts the ledger file exists and matches a minimal **schemaVersion 1** shape.

## Documentation deletion register (machine evidence)

High-confidence deletions (and future shallow archive moves) are recorded in **`docs/maintainers/data/documentation-deletion-register.v1.json`** with replacement guidance, inbound link survey notes, task/release references, and package impact. CI (`pnpm run check` → `documentation-deletion-register`) validates register rows against on-disk reality (deleted paths stay absent; archived paths must live under **`docs/maintainers/archive/`**).

## Related

- **`.cursor/rules/agent-doc-routing.mdc`** — agent default routing for `docs/` vs `.ai/`.
- **`docs/maintainers/AGENTS.md`** — maintainer index (this file is linked from there).
- **`docs/maintainers/adrs/ADR-ai-canonical-maintainer-docs-pipeline.md`** — `.ai` → `docs` pipeline manifest and pairing rules.

<!-- GENERATED FROM .ai/playbooks/improvement-scout.md — edit that file; do not hand-edit this render (see docs/maintainers/adrs/ADR-ai-canonical-maintainer-docs-pipeline.md) -->

# Playbook: improvement scout

**Playbook id:** `improvement-scout`  
**Use when:** Running a **structured, bounded** pass to surface friction **before** opening **`type: "improvement"`** tasks — complements **`improvement-task-discovery`** with rotation discipline, lenses, and an evidence floor.

Compose by reference; do **not** duplicate Tier **B** policy prose from [`AGENT-CLI-MAP.md`](../AGENT-CLI-MAP.md) or [`POLICY-APPROVAL.md`](../POLICY-APPROVAL.md).

## 0) Scout vs open-ended discovery

- **Scout (this playbook):** cap surfacing at **1–3** candidate findings per interval; use **rotation memory** (see **`workspace-kit run scout-report`**) so lenses and zones do not stall on the same groove; run a **primary** lens pass then a short **adversarial** pass.
- **Open discovery:** use **`improvement-task-discovery`** when you need breadth-first exploration without scout caps or rotation.

## 1) Primary lens catalog

Pick **one primary** lens per run (ids are stable for **`metadata.primaryLens`**):

| Lens id | Focus |
| --- | --- |
| `determinism` | Flaky tests, non-deterministic CLI output, ordering surprises |
| `operator-friction` | Extra steps, unclear errors, missing remediation links |
| `policy-confusion` | Wrong approval lane, Tier A/B mixups, env vs JSON approval |
| `doc-drift` | README vs behavior, broken links, AGENT-CLI-MAP gaps |
| `config-surprise` | Layering wins, validation messages, unknown keys |
| `persistence-integrity` | SQLite vs JSON, cursor loss, silent stomps |
| `module-boundary` | Router leaks, duplicated logic across modules |
| `extension-contract` | Extension vs CLI JSON shapes, thin-client violations |
| `release-gates` | RELEASING friction, parity, maintainer-gates |
| `utility-expansion` | `--help`, discovery, DX papercuts |

Optional **adversarial** lens: pick a **second** id from the same table (often `policy-confusion` or `persistence-integrity`) for a “what breaks if…” pass.

## 2) Adversarial prompts (second pass)

After primary notes, ask **one** adversarial question, for example:

- Where would a **skipped `policyApproval`** still look like success?
- What doc says **always** but the code branches?
- What requires **maintainer tribal knowledge** with no instruction anchor?

## 3) Target zones (kit surfaces)

Align probes to: **policy traces**, **task transitions**, **transcript archive**, **config mutations**, **parity scripts**, **extension webview**, **`workspace-kit doctor`**, **planning generation**, **lineage**.

## 4) Question stem roulette

Rotate stems such as: “Where does **A** contradict **B**?”, “What fails **closed** vs **open**?”, “Which **`operationId`** is missing from the CLI map?”

## 5) Evidence floor

Each **candidate** finding (before **`create-task`**) cites **≥2 anchors** (paths, instruction filenames, or command names) and **at least one** concrete repo-relative **path**.

## 6) Emit cap

Return **at most 1–3** candidate findings per scout interval; prefer depth over list dumps.

## 7) Read-only rehearsal JSON

`workspace-kit run scout-report '{}'` emits structured **candidate** shapes **without** persisting tasks or mutating improvement cursors. Use it to pick lenses/zones/stems from **rotation state**; **persist** only via **`create-task`** or Tier **B** **`generate-recommendations`** / **`ingest-transcripts`** with JSON **`policyApproval`** when you are ready.

## 8) Scout proposal metadata (optional on improvement tasks)

When logging from a scout pass, optional **`metadata`** keys:

| Key | Type | Meaning |
| --- | --- | --- |
| `primaryLens` | string | Id from §1 |
| `adversarialLens` | string | Id from §1 |
| `findingType` | string | e.g. `doc-gap`, `policy-ux`, `determinism`, `operator-friction` |
| `evidenceAnchors` | string[] | Paths, commands, **`operationId`** values |
| `riskNotes` | string | Short free text (severity, blast radius) |
| `noveltyHint` | string | One of `repeat`, `likely-new`, `unknown` |

Pipeline-created tasks may attach the same keys when **`scoutMeta`** is present on internal candidates (improvement module).

## Related

- **`improvement-task-discovery`** — research → problem report
- **`improvement-triage-top-three`** — promote **`proposed`** → **`ready`**
- **`docs/maintainers/ARCHITECTURE.md`** — module boundaries
- **`.ai/MACHINE-PLAYBOOKS.md`** — compressed agent expectations

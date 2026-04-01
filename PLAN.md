# Workflow Cannon — product feature ideation (exercise)

**Purpose:** Capture a structured brainstorm of high-impact capabilities aligned with Workflow Cannon’s positioning: CLI-first task engine, policy-governed automation, deterministic contracts, evidence quality, and optional Cursor extension as a thin client.

**Principles anchor:** Safety and trustworthiness → correctness and determinism → compatibility and upgrade safety → operability and evidence quality → delivery speed and convenience (see `.ai/PRINCIPLES.md`).

**Doc basis:** `README.md`, `docs/maintainers/ROADMAP.md`, `docs/maintainers/AGENTS.md`, `docs/maintainers/FEATURE-MATRIX.md`, `docs/maintainers/data/workspace-kit-status.yaml` (state as of the exercise).

---

## Next 20 feature directions

Each item: **description** → **why it’s a great idea** (UX, architecture, practicality, demand) → **why it’s a bad idea (for now)** (risk, scope, maintenance).

### 1. “Merge ≠ done” guardian (Git ↔ task engine)

Automatic report surfacing PRs whose branch merged but `run-transition complete` never ran, or tasks left `in_progress` without recent commits. Reduces silent desync between Git reality and canonical task state.

**Why it’s a great idea:** Addresses the #1 human pain called out in maintainer runbooks (merge ≠ task complete) with **actionable UX** instead of tribal knowledge; low ceremony for teams already living in PRs; strengthens **trust** that the queue matches shipped reality.

**Why it’s a bad idea (for now):** Ties the kit to Git hosting APIs, auth, and branch/PR semantics; heuristics (“no recent commits”) create false alarms and ongoing support load; risks blurring the intentional boundary that **Git does not own task lifecycle**.

### 2. Evidence bundle exporter (one zip, one story)

A command (e.g. `workspace-kit run export-evidence-bundle`) that assembles task history, recent policy traces, config mutation records, and parity-related artifacts into a single reproducible bundle for audit or postmortem.

**Why it’s a great idea:** **Operability and evidence quality** in one gesture—security reviews, release retros, and “show your work” to leadership without hand-collecting files; fits the kit’s **machine-readable** story and likely **enterprise demand**.

**Why it’s a bad idea (for now):** Easy to accidentally **zip secrets** (tokens in traces, local paths, env-derived config); bundle schema becomes another compatibility surface; auditors may treat the export as *complete* when it is only *what the kit knew*.

### 3. Policy rehearsal mode (dry-run approvals)

Simulate sensitive commands with full trace output and no persistence, enabling CI “policy contract” checks without mutating workspace state.

**Why it’s a great idea:** Lets teams **regression-test policy wiring** the same way they test schemas—fast feedback in CI, safer refactors of sensitive commands, and clearer **architecture** boundary between “allowed shape” and “real mutation.”

**Why it’s a bad idea (for now):** Dry-run and real paths **diverge** unless duplicated with extreme discipline; teams may skip real `policyApproval` flows because “CI said OK”; doubles test matrix and maintenance for every sensitive command.

### 4. Task “time travel” replay (read-only)

Reconstruct `queue-health` / `get-next-actions` as-of a specific commit or exported snapshot, answering “why did the queue look like that then?”

**Why it’s a great idea:** Turns “the agent did the wrong task” disputes into **debuggable, read-only forensics**; high **practicality** for long-running phases and onboarding (“what was next at release X?”); reinforces **determinism** as a product promise.

**Why it’s a bad idea (for now):** Requires **versioned task-store migrations** and historical command semantics; old snapshots + new code = subtle bugs; high complexity for a niche debugging story unless you already retain perfect exports.

### 5. Dependency graph + critical path in the extension

Visual blocked-by chains on top of existing dashboard summaries so operators parse queue structure faster than flat JSON lists.

**Why it’s a great idea:** **UX** win for humans who do not live in JSON—immediate grasp of unblockers and critical path; builds on existing extension contracts without asking users to run graphviz by hand; strong **demand** from anyone juggling dependencies.

**Why it’s a bad idea (for now):** Pushes the **thin client** toward a graph UI product (layout, a11y, performance); large queues get unreadable fast; duplicates mental models that agents already consume as structured JSON.

### 6. Playbook runner (canon-by-reference)

Step-through execution in the terminal: each step runs the exact `workspace-kit` invocation from `docs/maintainers/AGENT-CLI-MAP.md`, records structured exit evidence. Playbooks remain links to canon; execution becomes repeatable and logged.

**Why it’s a great idea:** Bridges **playbooks** (intent) and **CLI** (proof)—trainable onboarding, fewer skipped `policyApproval` steps, and a single **architecture** story: canon stays authoritative while runs produce evidence.

**Why it’s a bad idea (for now):** Parsing **AGENT-CLI-MAP** or playbooks as executable is fragile; encourages “run the runner” instead of understanding policy; another runner to secure, version, and keep aligned when copy-paste JSON changes.

### 7. Team queue namespaces (multi-track)

Optional stream or label dimension (e.g. platform vs product) with filtered `get-next-actions` and extension views — one repo, parallel maintainer lanes without overloading a single flat queue narrative.

**Why it’s a great idea:** **Practical** for real orgs: one monorepo, multiple squads—each gets a sane **next-actions** view; reduces noise and cross-team thrash; aligns with how **demand** actually shows up (parallel workstreams).

**Why it’s a bad idea (for now):** **`get-next-actions`** is already a carefully ordered contract; extra dimensions multiply **priority conflicts** and “which queue is truth?”; schema and migration pain for every consumer.

### 8. Consumer “golden path” wizard

`wk onboard` (or equivalent) that bootstraps minimal config, runs `doctor`, prints the default first-run command trio, and emits a project-local `AGENTS.md` stub pointing at the Agent CLI map.

**Why it’s a great idea:** Cuts **time-to-first-success** for npm consumers—big lever for adoption; encodes the intended **UX** path (`doctor` → `run` menu → next-actions); reduces support burden (“what do I run first?”).

**Why it’s a bad idea (for now):** Scaffolding **stale templates** in consumer repos; opinionated defaults can violate org policy; another path that must stay in sync with `doctor`, config metadata, and docs or you ship silent drift.

### 9. IDE-agnostic “kit status” integration

A thin protocol (LSP companion, simple JSON-RPC, or similar) exposing `doctor`, `dashboard-summary`, and `get-next-actions` so editors beyond Cursor can reuse the same contracts.

**Why it’s a great idea:** **Architecture** payoff: one stable contract, many surfaces—VS Code, JetBrains, web dashboards—without forking kit logic; meets **user demand** from teams standardized on non-Cursor IDEs; keeps the CLI canonical while improving **everyday UX**.

**Why it’s a bad idea (for now):** A second long-lived **public protocol** (versioning, security, process spawning) dwarfs the Cursor extension cost; risks becoming the product instead of the CLI; every editor needs bespoke UX anyway.

### 10. Transcript → task diff linker

When improvement generation runs, attach git diff since last ingest and touched paths into improvement metadata so triage is evidence-backed, not free-floating.

**Why it’s a great idea:** Makes **improvement triage** fast and defensible—reviewers see *why* a recommendation fired; aligns with **evidence-first** principles; high **practicality** for “is this still real?” decisions.

**Why it’s a bad idea (for now):** Diffs can leak **secrets and PII** into task metadata; size and noise explode; ties improvement quality to **non-deterministic** git state unless you freeze SHAs and submodules carefully.

### 11. Confidence-calibrated improvement inbox

Unified triage surface: dedupe signals, evidence strength, and “already addressed on main?” hints so `improvement-triage-top-three` style workflows spend less time on archaeology.

**Why it’s a great idea:** Directly supports the **documented triage playbook** with less cognitive load; shrinks backlog dread—operators promote work with **confidence**; strong fit for teams scaling transcript-driven improvements (**demand** follows automation).

**Why it’s a bad idea (for now):** Heuristics read as **oracle**; wrong “already fixed” signals erode trust in the whole improvement loop; another ML-ish surface to explain, test, and defend under PRINCIPLES (determinism first).

### 12. Response-template lint in CI

Optional strict mode in CI: fail when resolved template IDs or explicit-vs-directive conflicts would break enforcement expectations — catches governance drift before merge.

**Why it’s a great idea:** Shifts governance left—**CI as safety net** for template/config drift; cheap **architecture** win (reuse existing resolve rules); appeals to orgs that already gate merges on policy-shaped checks.

**Why it’s a bad idea (for now):** CI must **mirror full resolve** semantics (config layers, overrides); flaky or slow checks block merges; teams enable strict mode prematurely and fight the tool instead of the docs.

### 13. Planning session resume cards

Persisted `build-plan` context surfaced as a single “you were here” card: last question, captured constraints, next planning command — strong fit for long sessions and context compaction.

**Why it’s a great idea:** Excellent **UX** for agent-heavy workflows: recovers from compaction or tab chaos without re-interviewing; uses data you already persist (`build-plan` / dashboard story); reduces abandoned planning sessions (**practicality**).

**Why it’s a bad idea (for now):** More **dashboard-specific** presentation logic in the extension; resume state can disagree with replanning or partial saves; UX expectations (“always resume”) conflict with explicit planning commands as source of truth.

### 14. Cross-repo parity matrix

For organizations with multiple kit consumers: one command comparing kit version, config keys, module enablement, and `doctor` outcomes across a list of repos.

**Why it’s a great idea:** **Platform teams** will ask for this unprompted—one place to see version skew and misconfig; turns parity thinking into a routine **ops** command; reinforces kit as **governable** across a fleet.

**Why it’s a bad idea (for now):** Implies **filesystem or VCS layout** assumptions, tokens for monorepo tools, and long-running IO; becomes an org-political report (“why is team B red?”) the core package shouldn’t own.

### 15. Synthetic load harness for task engine

Generate large synthetic task graphs and transition churn against a throwaway store to benchmark SQLite behavior, extension refresh, and `queue-health` under stress.

**Why it’s a great idea:** Protects **architecture** under growth—finds contention and hot paths before users do; gives maintainers **numbers** for extension refresh and DB tuning; low end-user surface area but high **risk reduction**.

**Why it’s a bad idea (for now):** High maintenance **for maintainers**, low direct value for typical consumers; numbers without SLOs invite bikeshedding; can distract from correctness bugs that only appear in real task shapes.

### 16. Human interrupt and delegation on tasks

First-class blocked-reason taxonomy plus optional fields such as delegate or review owner so `get-next-actions` can prioritize human-unblocked work without abusing free-form notes.

**Why it’s a great idea:** Makes **blocked** legible to humans and agents—better summaries, clearer handoffs, less garbage in `notes`; **demand** from any team using the queue as coordination, not just a solo maintainer.

**Why it’s a bad idea (for now):** Creeps toward **mini-PM software** (identity, ACLs, notifications); `get-next-actions` ordering becomes politicized; empty or stale delegate fields add noise without enforcement.

### 17. GitHub Check integration (read-only first)

PR check or comment summarizing `queue-health`, phase alignment hints, and ready-queue signals — visibility in CI without cloud-side state mutation.

**Why it’s a great idea:** Meets people where they work (**GitHub UX**); passive visibility for leads without opening the extension; **read-only first** respects policy boundaries while boosting **transparency**—often requested once kit adoption spreads.

**Why it’s a bad idea (for now):** **Comment/check spam** and token management; CI sees a different checkout than local (submodules, shallow clone); exposes internal queue shape to everyone with PR access unless carefully redacted.

### 18. Config “intent layers” for agents

Beyond `resolve-config`: a narrowed explain view listing only keys that affect policy, transcript cadence, and persistence — smaller context and fewer wrong invocations for agents.

**Why it’s a great idea:** **Token- and attention-efficient** for LLM agents—fewer bad `workspace-kit` calls; encodes **architecture** knowledge (what actually gates behavior) in one query; **practicality** scales with config surface area.

**Why it’s a bad idea (for now):** A second **explain matrix** to keep aligned with metadata and real behavior; “safety subset” that omits a key becomes a silent footgun; agents may never learn full `resolve-config` when debugging.

### 19. Wishlist / planning → implementation estimate pack

On conversion to execution tasks, optional pre-filled sizing (S/M/L), risk, test surface, and rollback notes derived from planning artifacts — bridges ideation to shippable slices.

**Why it’s a great idea:** Smooth **planning → execution** handoff—less blank-page syndrome when creating tasks; helps humans and agents **scope** work consistently; aligns with how product-minded users already think (**demand** at conversion moments).

**Why it’s a bad idea (for now):** **False precision** from templated estimates; planning text ≠ implementation scope; fields rot or contradict acceptance criteria unless humans curate every conversion.

### 20. Trust dashboard: what the kit will not do

Single command or generated section documenting non-goals and boundaries (e.g. no chat-only policy satisfaction, no silent task-store edits, no network by default) for security reviewers and new contributors.

**Why it’s a great idea:** Shortens **security review** cycles and sets **trust** expectations for evaluators; great **onboarding UX** (“what am I buying?”); reinforces brand as **policy-serious** without reading the whole repo.

**Why it’s a bad idea (for now):** Security teams may treat it as **certification**; the list goes stale the moment behavior shifts; duplicates PRINCIPLES/AGENTS content and risks contradicting canon if not generated from a single source.

---

## Review summary (proposal, risk, value, further work)

Synthesis of each item’s upsides and downsides. **Further work:** *Develop* = worth a bounded slice or spike in core; *Park* = valid idea, not near-term; *Spike* = timebox exploration before committing.

#### 1. “Merge ≠ done” guardian

- **Proposal:** Flag merged PRs / stale `in_progress` tasks against canonical task state so Git and the queue stay honest.
- **Risk:** Git-hosting coupling, noisy heuristics, blurring “Git owns history / kit owns lifecycle.”
- **Value:** High for real teams—directly attacks documented failure mode (merge without `complete`).
- **Further work:** **Park** full GitHub/GitLab integration. **Spike** a **local-only** variant (workspace `git` + task ids) if demand is loud—no API keys.

#### 2. Evidence bundle exporter

- **Proposal:** One command to zip task history, policy traces, config evidence, parity artifacts for audit/postmortem.
- **Risk:** Secret leakage into bundles; new compatibility contract; “complete audit” illusion.
- **Value:** High for operability, enterprise reviews, and the kit’s evidence narrative.
- **Further work:** **Spike** with explicit **redaction allowlist**, max size caps, and a versioned manifest—ship only if those are non-negotiable in the design.

#### 3. Policy rehearsal mode

- **Proposal:** Dry-run sensitive commands in CI with traces, no persistence.
- **Risk:** Divergence from real paths; false confidence; doubled maintenance per command.
- **Value:** Medium-high for safe refactors and policy regression tests.
- **Further work:** **Park** until there is a written **parity rule** (what must match prod). Then **Spike** one command end-to-end.

#### 4. Task “time travel” replay

- **Proposal:** Read-only replay of `get-next-actions` / queue health as-of a snapshot or commit.
- **Risk:** Migration/version hell; misleading results if snapshot and code disagree.
- **Value:** Medium for disputes, releases, onboarding—“what did the queue say then?”
- **Further work:** **Park** unless you already standardize on **export-on-commit** and want to productize forensics.

#### 5. Dependency graph + critical path (extension)

- **Proposal:** Visual blocked-by / critical path on top of dashboard data.
- **Risk:** Thin-client bloat, a11y/perf, unreadable huge queues.
- **Value:** High human UX for dependency-heavy maintainers.
- **Further work:** **Spike** a **minimal** version: ordered “unblocker list” or small tree—**not** a general graph editor. **Park** full graph product.

#### 6. Playbook runner

- **Proposal:** Step through playbooks by executing mapped `workspace-kit` lines and logging evidence.
- **Risk:** Parsing canon is brittle; runner becomes the support surface.
- **Value:** High for onboarding and playbook adoption without copy-paste errors.
- **Further work:** **Park** auto-parse of markdown. **Develop** only if playbooks gain **machine-readable step blocks** (explicit JSON/YAML), same as human text.

#### 7. Team queue namespaces

- **Proposal:** Labels/streams + filtered `get-next-actions` for parallel squads in one repo.
- **Risk:** Competing truths for “next”; schema/migration load; ordering debates.
- **Value:** High for monorepos and multi-team demand.
- **Further work:** **Park** until there is a **single global ordering rule** doc and migration story. Then **Spike** filter-only (no new priority semantics).

#### 8. Consumer “golden path” wizard (`wk onboard`)

- **Proposal:** Bootstrap config, run `doctor`, print first commands, optional `AGENTS.md` stub.
- **Risk:** Stale scaffolds; wrong defaults for locked-down orgs; drift vs `doctor`.
- **Value:** Very high for npm adoption and support cost.
- **Further work:** **Develop** a **thin** version: pointers and `doctor` only; avoid opinionated policy defaults. Generated stub = links, not long prose.

#### 9. IDE-agnostic kit status protocol

- **Proposal:** LSP/RPC exposing `doctor`, `dashboard-summary`, `get-next-actions`.
- **Risk:** Second public protocol, security/versioning, becomes the main product.
- **Value:** High for non-Cursor shops and multi-IDE orgs.
- **Further work:** **Park** in core. **Develop** only as a **separate optional package** or community adapter that shells `wk`—keep CLI the only blessed API for v1.

#### 10. Transcript → task diff linker

- **Proposal:** Attach git diff / touched paths to improvement metadata at ingest.
- **Risk:** Secrets/PII in tasks; huge payloads; nondeterministic without pinned SHAs.
- **Value:** High for triage speed and evidence quality.
- **Further work:** **Spike** **opt-in**, **size-capped**, **redacted** diff summary (paths + stats, not full patch) defaulting off.

#### 11. Confidence-calibrated improvement inbox

- **Proposal:** Unified triage UI with dedupe strength and “maybe fixed on main” hints.
- **Risk:** Heuristic oracle failures erode trust; hard to keep deterministic.
- **Value:** High as transcript volume grows.
- **Further work:** **Develop** only **deterministic** signals (explicit dedupe keys, status filters). **Park** fuzzy “fixed on main” until provably rule-based.

#### 12. Response-template lint in CI

- **Proposal:** Optional CI fail on bad template ids / conflicts vs enforcement mode.
- **Risk:** CI/env mismatch with local resolve; merge friction if enabled too early.
- **Value:** Medium-high for governance-heavy consumers.
- **Further work:** **Develop** as **opt-in** script/`wk run` wrapper documented in RELEASING-style runbooks—not default CI for all.

#### 13. Planning session resume cards

- **Proposal:** Extension card for last planning step, constraints, next command.
- **Risk:** Stale resume vs replan; more extension-only logic.
- **Value:** High for long agent sessions and abandoned planning.
- **Further work:** **Develop** small slice: read existing persisted `build-plan` / dashboard fields only—no new persistence model.

#### 14. Cross-repo parity matrix

- **Proposal:** One command to compare kit version, config, modules, `doctor` across repos.
- **Risk:** Assumes repo layout/auth; political “scoreboard”; not core package sweet spot.
- **Value:** High for platform teams at scale.
- **Further work:** **Park** in core. **Develop** as **maintainer script** or **separate CLI** in docs/examples first.

#### 15. Synthetic load harness

- **Proposal:** Generate big synthetic task graphs to stress SQLite, refresh, `queue-health`.
- **Risk:** Maintainer time sink; misleading vs real shapes; bikeshedding SLOs.
- **Value:** Medium for core team risk reduction before scale pain.
- **Further work:** **Develop** **internal-only** (`scripts/` or dev dep), not published product surface—short timebox.

#### 16. Human interrupt and delegation fields

- **Proposal:** Taxonomy for blocked + optional delegate/review owner influencing ordering.
- **Risk:** Mini-PM product creep; politicized ordering; empty-field noise.
- **Value:** Medium-high for multi-person queues.
- **Further work:** **Spike** **blocked reason taxonomy + display only** (no delegation semantics). **Park** delegation until identity model exists.

#### 17. GitHub Check integration

- **Proposal:** Read-only check/comment with queue health and phase hints on PRs.
- **Risk:** Spam, token ops, shallow-clone skew, over-exposure of internal state.
- **Value:** High visibility where developers already look.
- **Further work:** **Park** in core. **Develop** as **documented sample Action** + redaction guidelines; let consumers own tokens.

#### 18. Config “intent layers” for agents

- **Proposal:** Narrow explain view: only policy / transcript / persistence keys.
- **Risk:** Second explain surface to sync; omitted-key footguns.
- **Value:** High for agent token efficiency and fewer bad invocations.
- **Further work:** **Develop** if implemented as **`explain-config --facet`** (or similar) **generated from existing config metadata**—one source of truth, tested same as `resolve-config`.

#### 19. Wishlist / planning → estimate pack

- **Proposal:** On convert, pre-fill S/M/L, risk, tests, rollback from planning text.
- **Risk:** False precision; fields contradict acceptance criteria.
- **Value:** Medium for faster task creation and consistent scoping language.
- **Further work:** **Spike** **optional** template with **empty defaults** and clear “human must verify” banner—**Park** auto-scoring from prose.

#### 20. Trust dashboard (non-goals)

- **Proposal:** One place listing what the kit will not do (policy, network, hand edits, etc.).
- **Risk:** Mistaken for certification; staleness; doc duplication.
- **Value:** High for security review and evaluator trust—fast “what is this?”
- **Further work:** **Develop** only as **generated output** from existing canon (documentation module / `.ai` records)—never hand-curated duplicate.

---

## Follow-up (optional)

Rank and slice these against `docs/maintainers/FEATURE-MATRIX.md` gaps, Phase 29+ roadmap intent, and previously deferred extension scope — prioritizing by impact, implementation cost, and fit with incremental, reversible delivery.

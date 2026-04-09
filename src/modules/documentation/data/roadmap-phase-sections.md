### Phase 53 - Relational feature registry (DB taxonomy Path A) -> GitHub release `v0.53.0` (COMPLETE)

- **Primary scope:** **`T630`–`T639`** — ADR (**`T630`**) for **Path A** (SQLite registry is source of truth for taxonomy) and **Option 1** (authoritative **`task_engine_task_features`** junction; **`features_json`** not source of truth); schema + migration + seed from legacy taxonomy (**`T631`**); persistence layer (**`T632`**); **`create-task`** / **`update-task`** / reads validate and use junction (**`T633`**); backfill + doctor (**`T634`**); **`list-tasks`** **`featureId`** / **`componentId`** filters (**`T635`**); **`generate-document`** / doc pipeline from DB (**`T636`**); contracts + instructions + **`AGENT-CLI-MAP`** (**`T637`**); Cursor extension **`dashboard-summary`** enrichment (**`T638`**); phase closeout tests + **`CHANGELOG`** + matrix (**`T639`**). **`improvement`** / **`wishlist_intake`**: no required feature links; unknown feature ids fail closed for execution tasks when provided.
- **Outcome:** Components and features are relational with FKs; task↔feature links are normalized; maintainer-facing taxonomy docs derive from DB (Path A); optional task features remain nullable/empty.
- **Exit signals:**
  - **`pnpm run build`**, **`check`**, **`test`**, **`parity`**, **`pre-merge-gates`** on the release tag; maintainer evidence per **`RELEASING.md`**.

### Phase 54 - Skill packs v1 -> GitHub release `v0.54.0` (COMPLETE)

- **Primary scope:** **`T640`–`T644`** — ADR + versioned manifest schema (**`T640`**) with **Claude Code interoperability**: normative mapping from per-skill directories and **`SKILL.md`** (YAML frontmatter + body, optional **`scripts/`** / **`references/`** / etc.) so a pack installed under **`.claude/skills/`** is valid on a configured Workflow Cannon skill root without parallel authoring unless the ADR introduces an optional sidecar; config + discovery incl. default **`.claude/skills/<id>/SKILL.md`** recognition (**`T641`**); **`apply-skill`** resolves instructions from **`SKILL.md`** for Claude-shaped packs (**`T642`**); attach skills to tasks and playbooks with ids aligned to discovered pack names (**`T643`**); **`recommend-skills`** v1 + **Claude-shaped** sample pack + maintainer docs for dual install (**`T644`**). Provenance: wishlist **`T564`** referenced from **`T640`** acceptance scope.
- **Outcome:** Packs are discoverable, inspectable, and applicable with explicit policy lanes; **skill trees that satisfy current Claude Code skill layout expectations generally work in Workflow Cannon** when placed on a configured root (unsupported Claude-only frontmatter or runtime knobs documented as non-goals or no-ops per ADR); optional task/playbook attachment and deterministic recommendations.
- **Exit signals:**
  - **`pnpm run build`**, **`check`**, **`test`**, **`parity`**, **`pre-merge-gates`** on the release tag; maintainer evidence per **`RELEASING.md`**.

### Phase 57 - Native subagents v1 -> GitHub release `v0.57.0` (COMPLETE)

- **Primary scope:** **`T662`–`T664`** — ADR + SQLite **`user_version` 6** tables (**`kit_subagent_definitions`**, **`kit_subagent_sessions`**, **`kit_subagent_messages`**) (**`T662`**); **`subagents`** module + manifest + policy **`subagents.persist`** (**`T663`**); spawn/message/close commands + operator runbook + **`AGENT-CLI-MAP`** (**`T664`**). Execution host remains Cursor (or similar); kit persists provenance only.
- **Outcome:** Delegated agent definitions and session/message audit are queryable in kit SQLite; Tier B mutations are policy-gated like other sensitive **`run`** commands.
- **Exit signals:**
  - **`pnpm run build`**, **`check`**, **`test`**, **`parity`**, **`pre-merge-gates`** on the release tag; maintainer evidence per **`RELEASING.md`**.

### Phase 58 - Team execution v1 -> GitHub release `v0.58.0` (COMPLETE)

- **Primary scope:** **`T665`–`T667`** — ADR + SQLite **`user_version` 7** table **`kit_team_assignments`** + handoff/reconcile contract v1 (**`T665`**); **`team-execution`** module commands + validation + **`AGENT-CLI-MAP`** / policy **`team-execution.persist`** (**`T666`**); supervisor runbook + explicit deferral of **`get-next-actions`** assignment surfacing with documented follow-up (**`T667`**).
- **Outcome:** Supervisors can register assignments against **`T###`** rows, workers submit structured handoffs, supervisors reconcile or block/cancel; persistence map and doctor surface **`user_version` 7**; team path complements subagent registry without launching remote workers from Node.
- **Exit signals:**
  - **`pnpm run build`**, **`check`**, **`test`**, **`parity`**, **`pre-merge-gates`** on the release tag; maintainer evidence per **`RELEASING.md`**.

### Phase 59 - Improvement scout + ingest heuristics -> GitHub release `v0.59.0` (COMPLETE)

- **Primary scope:** **`T679`–`T683`** — **`improvement-scout`** playbook (lenses, zones, stems, adversarial pass, evidence floor); optional scout **`metadata`** keys on improvement tasks; improvement state schema **`3`** with bounded **`scoutRotationHistory`**; read-only **`scout-report`** command (optional **`persistRotation`**); config **`improvement.recommendations.heuristicVersion`** **`1`**/**`2`** for alternate ingest admission. **Cancelled track (non-release):** **`T668`–`T670`** (Cursor chat prefill experiments) remain **`cancelled`**.
- **Outcome:** Operators can run a structured scout rehearsal without Tier B approval; rotation memory is opt-in; pipeline tasks can carry scout metadata; **`heuristic_2`** is opt-in and tested beside **`heuristic_1`** defaults.
- **Exit signals:**
  - **`pnpm run build`**, **`check`**, **`test`**, **`parity`**, **`pre-merge-gates`** on the release tag; maintainer evidence per **`RELEASING.md`**.

### Phase 60 - Run-args pilot + planning prelude + dashboard/subagent surfaces -> GitHub release `v0.60.0` (COMPLETE)

- **Primary scope:** **`T689`–`T740`** (and split tasks) — pilot **`schemas/pilot-run-args.snapshot.json`** for all manifest task-engine commands, **`schemas/planning-generation-cli-prelude.json`**, SQLite **`BEGIN IMMEDIATE`**, **`agent-session-snapshot`**, **`get-next-actions`** **`teamExecutionContext`**, **`dashboard-summary`** **`schemaVersion` 3** + **`subagentRegistry`**, package **`exports`** for contract subpaths, maintainer doc alignment (SQLite-only persistence).
- **Outcome:** Stronger CLI JSON validation and planning-generation ergonomics; extension **0.1.8** surfaces subagent registry card.
- **Exit signals:**
  - **`pnpm run build`**, **`check`**, **`test`**, **`parity`**, **`pre-merge-gates`** on the release tag; maintainer evidence per **`RELEASING.md`**.

### Phase 61 - Claude Code plugin platform v1 -> GitHub release `v0.61.0` (COMPLETE)

- **Primary scope:** **`T684`–`T687`** — ADR + **`schemas/claude-plugin-manifest.schema.json`** + **`plugins.discoveryRoots`**; **`list-plugins`** / **`inspect-plugin`**; **`install-plugin`** / **`enable-plugin`** / **`disable-plugin`** + **`plugins.persist`**; SQLite **`user_version` 8 **`kit_plugin_state`**; **`workspace-kit doctor`** summary; reference fixture **`docs/examples/claude-plugins/`** + CI smoke.
- **Outcome:** Deterministic plugin manifest validation, filesystem discovery aligned to Anthropic layout, optional SQLite enablement and copy-install with policy gates.
- **Exit signals:**
  - **`pnpm run build`**, **`check`**, **`test`**, **`parity`**, **`pre-merge-gates`** on the release tag; maintainer evidence per **`RELEASING.md`**.

### Phase 70 - Context Activation Engine (CAE) (IN FLIGHT)

- **Primary scope:** **`T837`–`T869`** — CAE architecture ADR and boundaries (code invariants vs advisory CAE); artifact registry + activation definition schemas + lifecycle; evaluation context contract; precedence / merge / effective bundle semantics; acknowledgement model (separate from `policyApproval`); persistence + trace + explain design; read-only CLI contract; shadow mode; CLI/router integration design; advisory surfacing; narrow enforcement lane design; mutation governance; failure/recovery; test plan; `.ai-first` operator docs; future cognitive-map contract; bootstrap registry seed; implementation (loader, context builder, evaluator, read-only commands, shadow pipeline, runtime hook, advisory payloads, enforcement, trace persistence, governed CRUD or validate-only, integration hardening).
- **Outcome:** Deterministic activation bundles for policy / think / do / review families; docs referenced by stable artifact ids; read-only inspectability and shadow rollout before allowlisted enforcement; no cognitive-map dependency in v1.
- **Exit signals:** Phase closeout per **`RELEASING.md`** when implementation train ships; routine gates **`pnpm run build`**, **`check`**, **`test`**, **`parity`** on release candidates.

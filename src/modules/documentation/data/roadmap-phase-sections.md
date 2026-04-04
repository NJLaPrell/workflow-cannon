### Phase 56 - Agent & task lifecycle hooks -> GitHub release `v0.56.0` (PLANNED)

- **Primary scope:** **`T645`–`T648`** — ADR + registration config + trace schema (**`T645`**); read-only hook dispatch + persisted traces on pilot events (**`T646`**); mutating outcomes + write hooks + shell hardening (**`T647`**); PR-oriented events (or documented stubs) + maintainer catalog + performance budgets (**`T648`**). Provenance: wishlist **`T563`**.
- **Outcome:** Named lifecycle events, deterministic handler ordering, structured audit traces, and documented fail-closed vs warn posture; HTTP webhook transport explicitly out of scope for this phase per task acceptance.
- **Exit signals:**
  - **`pnpm run build`**, **`check`**, **`test`**, **`parity`**, **`pre-merge-gates`** on the release tag; maintainer evidence per **`RELEASING.md`**.

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

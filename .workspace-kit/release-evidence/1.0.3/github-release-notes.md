# Workflow Cannon 1.0.3 — Phase 140

**One document. One journey. From raw idea to shipped work.**

This release unifies how Workflow Cannon tracks ideas. Instead of juggling separate idea rows, plan files, and status guesses, everything now lives in a single **IdeaPlan** that grows with you—from first spark through brainstorming, planning, review, acceptance, and delivery.

---

## ✨ Highlights

### Brainstorm before you plan
- Start a **guided brainstorming session** right from any idea in the dashboard.
- Capture scored sessions (value, risk, effort, confidence, priority) and see synthesized results at a glance.
- A new **Brainstorming** section on the Planning tab shows which ideas are being explored and how they rank.

### Plan without losing context
- **Plan this** still works the way you expect—but now it builds on the same document as your brainstorm notes.
- Review, accept, and finalize plans without creating duplicate artifacts or wondering which file is current.

### Know when work is really done
- Accepted ideas can move to **Delivered** automatically when their linked tasks finish.
- Use **Check delivery** on accepted ideas to see progress without digging through the task queue.

### Readable plan documents
- Every major planning step can regenerate a **human-readable plan document** under `docs/maintainers/plans/`—great for sharing, review, and audit trails.

### Safe rollout for existing workspaces
- A **migration command** promotes existing ideas and plans into the new unified format (dry-run first, snapshot before writes).
- New dashboard features stay behind a **feature flag** (`IDEAS_UNIFIED_MODEL_ENABLED`, default off) until you're ready to turn them on.
- Rollback runbook and scripts included if you need to undo a migration.

---

## 🎯 Who benefits

| You are… | What you get |
|----------|----------------|
| **Operator / maintainer** | Clearer idea lifecycle, less sync drift between ideas and plans |
| **Planning in Cursor chat** | Brainstorm and plan flows that share one source of truth |
| **Dashboard user** | Separate **Brainstorm** and **Plan** actions, scoring rollups, session history |

---

## 📦 Upgrade notes

1. Update to `@workflow-cannon/workspace-kit@1.0.3`.
2. Run `migrate-ideas-to-unified-document` with `dryRun: true` first to preview changes.
3. When satisfied, run migration for real (it snapshots before writing).
4. Enable `IDEAS_UNIFIED_MODEL_ENABLED` when you want the new Brainstorm UI and rollups.

No breaking changes to existing CLI command shapes for planning—the unified model is additive behind the migration and feature flag.

---

## 📋 Technical details

Maintainers: see [`docs/maintainers/CHANGELOG.md`](https://github.com/NJLaPrell/workflow-cannon/blob/main/docs/maintainers/CHANGELOG.md) for command names, schema paths, and migration procedures.

**Phase:** 140 · **Tasks delivered:** 19 · **Tag:** `v1.0.3`

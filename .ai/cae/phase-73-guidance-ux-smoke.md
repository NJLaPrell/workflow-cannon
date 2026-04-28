# Phase 73 Guidance UX Smoke Checklist

Machine-oriented implementation note for Phase 73 Guidance redesign and CAE management UX.

## Automated Evidence

- `npm run compile` in `extensions/cursor-workflow-cannon`
- `npm test` in `extensions/cursor-workflow-cannon`
- `npm run package` in `extensions/cursor-workflow-cannon`
- `pnpm run check` at the repository root
- Cursor diagnostics: no linter errors for edited Guidance files

## Manual Smoke Path

Use this checklist when loading the packaged extension in Cursor:

1. Open Workflow Cannon > Guidance.
2. Confirm the first visible job is `Before You Run` / `Check Before Running`, not raw status diagnostics.
3. Choose a task and workflow, then click `Check Before Running`.
4. Confirm the button enters a loading state, the result appears directly below the check card, and focus scrolls to the result.
5. Confirm result cards show required rules, recommendations, suggested steps, and review checks with debug ids collapsed.
6. Click `Review why` and confirm the explanation panel appears with user-facing labels and debug details collapsed.
7. Open `Recent Activity` and confirm repeated checks are grouped instead of rendered as a trace firehose.
8. Click `Improve this guidance` from a result or activity row and confirm the draft update form is prefilled.
9. Click `Preview Draft Impact` and confirm it runs a read-only preview against the selected task/workflow.
10. Review `Manage Guidance` and confirm the active guidance set, source/trigger counts, library, and version list render.
11. With `kit.cae.adminMutations` disabled, confirm live mutation controls fail closed with user-facing recovery text.
12. With admin mutations intentionally enabled in a disposable workspace, confirm clone/activate/rollback require actor and rationale and use `caeMutationApproval`.

## Guardrails

- Checking guidance is read-only and must not run the selected workflow.
- Feedback records a signal only; it must not change the active guidance set.
- Publishing, activation, and rollback are versioned CAE mutations and require audit rationale.

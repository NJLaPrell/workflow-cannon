/**
 * Documentation governance stages that must remain wired in `run-check-stages.mjs`
 * (Phase 96 / T100201). Update this list when adding or renaming doc gates.
 */
export const REQUIRED_DOC_GOVERNANCE_STAGE_IDS = [
  "documentation-data",
  "doc-lifecycle-report",
  "documentation-deletion-register",
  "ai-to-docs-drift",
  "orphan-ai-sources",
  "orphan-instructions"
];

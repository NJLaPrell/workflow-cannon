/** Module IDs whose workspace_module_state rows sync via planning.module_state.updated (Phase 120 S3). */
export const MODULE_STATE_PLANNING_SYNC_ALLOWLIST = [
  "improvement",
  "agent-behavior",
  "planning-build-session"
] as const;

export type ModuleStatePlanningSyncId = (typeof MODULE_STATE_PLANNING_SYNC_ALLOWLIST)[number];

export function isModuleStatePlanningSyncAllowed(moduleId: string): moduleId is ModuleStatePlanningSyncId {
  return (MODULE_STATE_PLANNING_SYNC_ALLOWLIST as readonly string[]).includes(moduleId);
}

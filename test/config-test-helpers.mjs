/** Merge `tasks.persistenceBackend: json` for tests that seed `.workspace-kit/tasks/state.json`. */
export function withJsonTaskPersistence(effective) {
  const base = effective && typeof effective === "object" && !Array.isArray(effective) ? effective : {};
  const tasks =
    base.tasks && typeof base.tasks === "object" && !Array.isArray(base.tasks) ? base.tasks : {};
  return {
    ...base,
    tasks: { ...tasks, persistenceBackend: "json" }
  };
}

/**
 * Policy-gated `workspace-kit run` commands owned by the task-engine module.
 * Keep in sync with instruction names in `task-engine-internal.ts` / registration.
 */
export const TASK_ENGINE_POLICY_COMMAND_NAMES = [["run-transition", "tasks.run-transition"]] as const;

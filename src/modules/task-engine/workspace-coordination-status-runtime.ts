import type { ModuleCommandResult, ModuleLifecycleContext } from "../../contracts/module-contract.js";
import { buildWorkspaceCoordinationStatus } from "./coordination/build-workspace-coordination-status.js";

export function runWorkspaceCoordinationStatus(ctx: ModuleLifecycleContext): ModuleCommandResult {
  const data = buildWorkspaceCoordinationStatus(ctx);
  return {
    ok: true,
    code: "workspace-coordination-status",
    message: "Read-only workspace coordination posture",
    data
  };
}

import { antigravitySpawnAdapter, vscodeCopilotSpawnAdapter } from "./stubs.js";
import { cliSpawnAdapter } from "./cli.js";
import { cursorSpawnAdapter } from "./cursor.js";
import type {
  BugReporterHostId,
  HostSpawnAdapter,
  HostSpawnPlan,
  HostSpawnRequest
} from "./types.js";
import { assertBugReportHandoff } from "./types.js";

export * from "./types.js";
export { cliSpawnAdapter, buildCliFilingPlan } from "./cli.js";
export { cursorSpawnAdapter, buildCursorSpawnPlan } from "./cursor.js";
export {
  antigravitySpawnAdapter,
  vscodeCopilotSpawnAdapter,
  buildAntigravitySpawnPlan,
  buildVscodeCopilotSpawnPlan,
  STUB_HOST_SPAWN_CONTRACT
} from "./stubs.js";

const ADAPTERS: Record<BugReporterHostId, HostSpawnAdapter> = {
  cursor: cursorSpawnAdapter,
  cli: cliSpawnAdapter,
  antigravity: antigravitySpawnAdapter,
  "vscode-copilot": vscodeCopilotSpawnAdapter
};

export function listBugReporterHostAdapters(): HostSpawnAdapter[] {
  return Object.values(ADAPTERS);
}

export function getBugReporterHostAdapter(hostId: BugReporterHostId): HostSpawnAdapter {
  return ADAPTERS[hostId];
}

/**
 * Resolve a spawn plan for a host. Unknown hosts fall back to CLI so core
 * filing never depends on a single IDE.
 */
export function resolveBugReporterSpawnPlan(
  hostId: string | undefined | null,
  request: HostSpawnRequest
): HostSpawnPlan {
  const checked = assertBugReportHandoff(request.handoff);
  if (!checked.ok) {
    throw new Error(checked.message);
  }
  const normalized = (hostId ?? "cli").trim().toLowerCase();
  const key: BugReporterHostId =
    normalized === "cursor"
      ? "cursor"
      : normalized === "antigravity"
        ? "antigravity"
        : normalized === "vscode-copilot" ||
            normalized === "vscode" ||
            normalized === "copilot"
          ? "vscode-copilot"
          : "cli";
  return ADAPTERS[key].buildPlan({ ...request, handoff: checked.handoff });
}

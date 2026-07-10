import { buildCliFilingPlan } from "./cli.js";
import type {
  HostSpawnAdapter,
  HostSpawnContractStub,
  HostSpawnPlan,
  HostSpawnRequest
} from "./types.js";
import { BUG_REPORT_HANDOFF_SCHEMA_VERSION } from "./types.js";

/**
 * Shared contract for hosts that lack a full v1 implementation.
 * Matching the spawn interface keeps the platform-agnostic surface stable.
 */
export const STUB_HOST_SPAWN_CONTRACT: HostSpawnContractStub = {
  backgroundPreferred: true,
  handoffSchemaVersion: BUG_REPORT_HANDOFF_SCHEMA_VERSION,
  defaultSkillId: "wc-bug-report",
  fallbackHost: "cli",
  notes:
    "v1 stub: honor fire-and-forget + BugReportHandoffV1; when the host cannot background-spawn, use the CLI file-bug-report adapter. Do not hard-code host APIs in module core."
};

/**
 * Antigravity IDE — documented stub matching the spawn interface.
 * Execution falls back to CLI filing until a native background spawn lands.
 */
export function buildAntigravitySpawnPlan(
  request: HostSpawnRequest
): Extract<HostSpawnPlan, { host: "antigravity" }> {
  return {
    host: "antigravity",
    maturity: "stub",
    awaitChild: false,
    contract: {
      ...STUB_HOST_SPAWN_CONTRACT,
      notes:
        "Antigravity IDE stub: prefer background agent with handoff JSON + skill wc-bug-report when available; otherwise CLI fallback. Default cheap model pin remains composer-2.5 for Cursor; Antigravity may map to a host-local cheap model later."
    },
    fallback: buildCliFilingPlan(request)
  };
}

export const antigravitySpawnAdapter: HostSpawnAdapter = {
  hostId: "antigravity",
  maturity: "stub",
  buildPlan(request) {
    return buildAntigravitySpawnPlan(request);
  }
};

/**
 * VS Code / GitHub Copilot — documented stub matching the spawn interface.
 */
export function buildVscodeCopilotSpawnPlan(
  request: HostSpawnRequest
): Extract<HostSpawnPlan, { host: "vscode-copilot" }> {
  return {
    host: "vscode-copilot",
    maturity: "stub",
    awaitChild: false,
    contract: {
      ...STUB_HOST_SPAWN_CONTRACT,
      notes:
        "VS Code Copilot stub: prefer background agent / chat agent with handoff JSON + skill wc-bug-report when available; otherwise CLI fallback. Do not require Copilot APIs for core filing."
    },
    fallback: buildCliFilingPlan(request)
  };
}

export const vscodeCopilotSpawnAdapter: HostSpawnAdapter = {
  hostId: "vscode-copilot",
  maturity: "stub",
  buildPlan(request) {
    return buildVscodeCopilotSpawnPlan(request);
  }
};

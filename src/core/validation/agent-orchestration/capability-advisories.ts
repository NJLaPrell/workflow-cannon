import { AGENT_CAPABILITY_VOCABULARY } from "../../../contracts/agent-orchestration.js";
import type { OrchestrationValidationIssue } from "./types.js";

const KNOWN = new Set<string>(AGENT_CAPABILITY_VOCABULARY);

function warnUnknownCapability(capability: string, path: string): OrchestrationValidationIssue {
  return {
    code: "unknown-capability",
    path,
    message: `Capability '${capability}' is not in the known vocabulary (A-SCHEMA §2.4). It is accepted in v1 bridge mode but may be rejected in a future strict profile.`,
    severity: "warning"
  };
}

export function collectUnknownCapabilityWarnings(input: {
  requiredCapabilities?: unknown;
  optionalCapabilities?: unknown;
}): OrchestrationValidationIssue[] {
  const warnings: OrchestrationValidationIssue[] = [];
  for (const [field, basePath] of [
    ["requiredCapabilities", "/requiredCapabilities"],
    ["optionalCapabilities", "/optionalCapabilities"]
  ] as const) {
    const list = input[field];
    if (!Array.isArray(list)) {
      continue;
    }
    list.forEach((cap, index) => {
      if (typeof cap === "string" && cap.length > 0 && !KNOWN.has(cap)) {
        warnings.push(warnUnknownCapability(cap, `${basePath}/${index}`));
      }
    });
  }
  return warnings;
}

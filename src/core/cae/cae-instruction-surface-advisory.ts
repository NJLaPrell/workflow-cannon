import { getAtPath } from "../workspace-kit-config.js";
import { buildEvaluationContext } from "./evaluation-context-builder.js";
import { evaluateActivationBundle } from "./cae-evaluate.js";
import { loadCaeRegistryForKit } from "./cae-registry-effective.js";
import type { AgentInstructionSurfaceCae } from "../agent-instruction-surface.js";

const SURFACE_COMMAND = "__agent_instruction_surface__";

function countFamily(bundle: Record<string, unknown>, key: string): number {
  const fam = bundle.families as Record<string, unknown[]> | undefined;
  const arr = fam?.[key];
  return Array.isArray(arr) ? arr.length : 0;
}

/**
 * Bounded advisory `cae` block for `doctor --agent-instruction-surface` (**`T865`**).
 */
export function buildCaeAdvisoryInstructionSurfaceBlock(
  workspacePath: string,
  effective: Record<string, unknown>
): AgentInstructionSurfaceCae | undefined {
  const enabled = getAtPath(effective, "kit.cae.enabled") === true;
  const advisory = getAtPath(effective, "kit.cae.advisoryInstructionSurface") === true;
  if (!enabled || !advisory) return undefined;

  const phase = String(getAtPath(effective, "kit.currentPhaseNumber") ?? "0");
  const load = loadCaeRegistryForKit(workspacePath, effective);
  if (!load.ok) {
    return {
      schemaVersion: 1,
      advisory: true,
      summary: {
        policyCount: 0,
        thinkCount: 0,
        doCount: 0,
        reviewCount: 0,
        shadow: false
      },
      issues: [{ code: load.code, detail: load.message ?? "" }]
    };
  }

  const ctx = buildEvaluationContext({
    taskRow: null,
    command: { name: SURFACE_COMMAND, moduleId: "context-activation", args: {} },
    workspace: { currentKitPhase: phase },
    governance: { policyApprovalRequired: false, approvalTierHint: "C" },
    queue: { readyQueueDepth: 0, suggestedNextTaskId: null }
  });

  const { bundle, trace, traceId } = evaluateActivationBundle(ctx, load.value, { evalMode: "live" });
  return {
    schemaVersion: 1,
    advisory: true,
    traceId,
    summary: {
      policyCount: countFamily(bundle, "policy"),
      thinkCount: countFamily(bundle, "think"),
      doCount: countFamily(bundle, "do"),
      reviewCount: countFamily(bundle, "review"),
      shadow: false
    },
    issues: [],
    traceEventCount: Array.isArray(trace.events) ? trace.events.length : 0
  };
}

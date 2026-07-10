import {
  WC_BUG_REPORTER_PREFERRED_MODEL,
  WC_BUG_REPORTER_SUBAGENT_ID
} from "../subagent-seed/wc-bug-reporter-seed.js";
import type { HostSpawnAdapter, HostSpawnPlan, HostSpawnRequest } from "./types.js";
import { assertBugReportHandoff } from "./types.js";

/**
 * Full Cursor host adapter: background Task tool + handoff JSON prompt.
 * Does not await the child (fire-and-forget).
 */
export function buildCursorSpawnPlan(request: HostSpawnRequest): Extract<HostSpawnPlan, { host: "cursor" }> {
  const checked = assertBugReportHandoff(request.handoff);
  if (!checked.ok) {
    throw new Error(checked.message);
  }
  const { handoff } = checked;
  const model = request.model?.trim() || WC_BUG_REPORTER_PREFERRED_MODEL;
  const prompt = JSON.stringify(handoff);
  const description =
    handoff.symptom.length > 48 ? `Bug report: ${handoff.symptom.slice(0, 45)}...` : `Bug report: ${handoff.symptom}`;

  const plan: Extract<HostSpawnPlan, { host: "cursor" }> = {
    host: "cursor",
    maturity: "implemented",
    awaitChild: false,
    taskTool: {
      tool: "Task",
      run_in_background: true,
      subagent_type: "generalPurpose",
      model,
      prompt,
      description
    }
  };

  if (request.recordProvenance) {
    plan.provenance = {
      commandName: "spawn-subagent",
      argsHint: {
        subagentId: request.subagentId ?? WC_BUG_REPORTER_SUBAGENT_ID,
        hostHint: "cursor",
        promptSummary: request.promptSummary ?? handoff.symptom
      }
    };
  }

  return plan;
}

export const cursorSpawnAdapter: HostSpawnAdapter = {
  hostId: "cursor",
  maturity: "implemented",
  buildPlan(request) {
    return buildCursorSpawnPlan(request);
  }
};

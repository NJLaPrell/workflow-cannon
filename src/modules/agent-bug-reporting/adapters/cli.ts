import {
  WC_BUG_REPORTER_PREFERRED_MODEL,
  WC_BUG_REPORTER_SUBAGENT_ID
} from "../subagent-seed/wc-bug-reporter-seed.js";
import type {
  HostSpawnAdapter,
  HostSpawnPlan,
  HostSpawnRequest
} from "./types.js";
import { assertBugReportHandoff } from "./types.js";

/**
 * Direct CLI filing adapter — core path that works without any IDE host.
 * Maps structured handoff → `file-bug-report` argv.
 */
export function buildCliFilingPlan(request: HostSpawnRequest): Extract<HostSpawnPlan, { host: "cli" }> {
  const checked = assertBugReportHandoff(request.handoff);
  if (!checked.ok) {
    throw new Error(checked.message);
  }
  const { handoff } = checked;
  const title =
    handoff.symptom.length > 72 ? `${handoff.symptom.slice(0, 69)}...` : handoff.symptom;
  const evidence =
    handoff.evidenceCrumbs && handoff.evidenceCrumbs.length > 0
      ? handoff.evidenceCrumbs.join(" | ")
      : undefined;
  const args: Record<string, unknown> = {
    title,
    symptom: handoff.symptom
  };
  if (handoff.command) args.command = handoff.command;
  if (handoff.code) args.code = handoff.code;
  if (handoff.remediationHint) args.remediation = handoff.remediationHint;
  if (handoff.relatedTaskId) args.relatedTaskId = handoff.relatedTaskId;
  if (evidence) args.evidence = evidence;
  if (handoff.clientMutationId) {
    args.clientMutationId = handoff.clientMutationId;
    args.evidenceKey = handoff.clientMutationId;
  }

  const json = JSON.stringify(args);
  const argvExample = `pnpm exec wk run file-bug-report '${json}'`;

  const plan: Extract<HostSpawnPlan, { host: "cli" }> = {
    host: "cli",
    maturity: "implemented",
    awaitChild: false,
    filing: {
      commandName: "file-bug-report",
      args,
      argvExample
    }
  };

  if (request.recordProvenance) {
    plan.provenance = {
      commandName: "spawn-subagent",
      argsHint: {
        subagentId: request.subagentId ?? WC_BUG_REPORTER_SUBAGENT_ID,
        hostHint: "cli",
        promptSummary: request.promptSummary ?? handoff.symptom
      }
    };
  }

  return plan;
}

export const cliSpawnAdapter: HostSpawnAdapter = {
  hostId: "cli",
  maturity: "implemented",
  buildPlan(request) {
    return buildCliFilingPlan(request);
  }
};

/** @internal re-export for stubs that share default model docs */
export const CLI_FALLBACK_MODEL = WC_BUG_REPORTER_PREFERRED_MODEL;

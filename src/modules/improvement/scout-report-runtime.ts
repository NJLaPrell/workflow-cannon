import type { ModuleLifecycleContext } from "../../contracts/module-contract.js";
import {
  appendScoutRotationEntry,
  loadImprovementState,
  saveImprovementState
} from "./improvement-state.js";
import {
  buildScoutRotationEntry,
  nextScoutQuadrant,
  pickAdversarialLens,
  pickPrimaryLens,
  pickQuestionStem,
  pickTargetZone
} from "./scout-rotation.js";

export type ScoutReportArgs = {
  seed?: string;
  /** When true, append this run to `scoutRotationHistory` and save improvement state. */
  persistRotation?: boolean;
};

export async function runScoutReport(
  ctx: ModuleLifecycleContext,
  args: ScoutReportArgs
): Promise<Record<string, unknown>> {
  const seed =
    typeof args.seed === "string" && args.seed.trim().length > 0 ? args.seed.trim() : "scout-report";
  const persistRotation = args.persistRotation === true;

  const state = await loadImprovementState(
    ctx.workspacePath,
    ctx.effectiveConfig as Record<string, unknown> | undefined
  );
  const history = state.scoutRotationHistory;
  const quadrant = nextScoutQuadrant(`${seed}:${history.length}`);
  const primaryLens = pickPrimaryLens(quadrant, seed, history);
  const adversarialLens = pickAdversarialLens(primaryLens, seed, history);
  const targetZone = pickTargetZone(seed, history);
  const questionStem = pickQuestionStem(seed, history);
  const runAt = new Date().toISOString();

  const candidateFindings = [
    {
      classification: "rehearsal" as const,
      findingType: "operator-friction",
      summary: `Probe **${targetZone}** under primary lens **${primaryLens}**; cap at three findings per scout interval.`,
      evidenceAnchors: [
        "docs/maintainers/playbooks/improvement-scout.md",
        "docs/maintainers/AGENT-CLI-MAP.md",
        "src/modules/improvement/scout-report-runtime.ts"
      ]
    },
    {
      classification: "rehearsal" as const,
      findingType: "policy-ux",
      summary: `Adversarial lens **${adversarialLens}**: ${questionStem}`,
      evidenceAnchors: [
        "docs/maintainers/POLICY-APPROVAL.md",
        ".ai/machine-cli-policy.md",
        "src/modules/improvement/generate-recommendations-runtime.ts"
      ]
    },
    {
      classification: "rehearsal" as const,
      findingType: "doc-gap",
      summary:
        "Persist only via **create-task** (**type: improvement**) or Tier B **generate-recommendations** / **ingest-transcripts** with JSON **policyApproval**.",
      evidenceAnchors: [
        "docs/maintainers/playbooks/improvement-task-discovery.md",
        "docs/maintainers/TERMS.md"
      ]
    }
  ];

  if (persistRotation) {
    const entry = buildScoutRotationEntry({
      primaryLens,
      adversarialLens,
      targetZone,
      questionStem,
      runAt
    });
    appendScoutRotationEntry(state, entry);
    await saveImprovementState(
      ctx.workspacePath,
      state,
      ctx.effectiveConfig as Record<string, unknown> | undefined
    );
  }

  return {
    schemaVersion: 1,
    runAt,
    seed,
    persistRotation,
    rotation: { quadrant, historyLength: history.length },
    primaryLens,
    adversarialLens,
    targetZone,
    questionStem,
    candidateFindings,
    scoutPlaybookId: "improvement-scout"
  };
}

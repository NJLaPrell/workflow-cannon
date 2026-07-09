import type { ModuleCommandResult, ModuleCommandRuntime } from "../contracts/module-contract.js";
import { MCP_PLANNER_PACKET_OUTPUT_BYTE_BUDGET } from "./output-budgets.js";

export const PLANNER_PACKET_TOOL_NAME = "workflow-cannon.planner-packet";

const WBS_PREVIEW_MAX_ROWS = 5;
const WBS_PREVIEW_TRUNCATED_MAX_ROWS = 3;

export type PlannerPacketWbsPreviewRow = {
  wbsId: string;
  title: string;
  dependsOn?: string[];
  sizingConfidence?: string;
};

export type PlannerPacketData = Record<string, unknown>;

function cleanString(raw: unknown): string | undefined {
  return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
}

function isIdeaIdShape(value: string): boolean {
  return /^I\d{3,}$/.test(value);
}

function toRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function slimIdeaRow(idea: unknown): Record<string, unknown> | undefined {
  const record = toRecord(idea);
  if (typeof record.id !== "string") {
    return undefined;
  }
  return {
    id: record.id,
    title: record.title,
    status: record.status,
    sortOrder: record.sortOrder,
    linkedPlanArtifact: record.linkedPlanArtifact,
    note: record.note
  };
}

function buildWbsPreviewRows(wbs: unknown, maxRows: number): PlannerPacketWbsPreviewRow[] {
  if (!Array.isArray(wbs)) {
    return [];
  }
  return wbs.slice(0, maxRows).flatMap((row) => {
    const record = toRecord(row);
    if (typeof record.wbsId !== "string" || typeof record.title !== "string") {
      return [];
    }
    const preview: PlannerPacketWbsPreviewRow = {
      wbsId: record.wbsId,
      title: record.title
    };
    if (Array.isArray(record.dependsOn)) {
      preview.dependsOn = record.dependsOn.filter((dep): dep is string => typeof dep === "string");
    }
    if (typeof record.sizingConfidence === "string") {
      preview.sizingConfidence = record.sizingConfidence;
    }
    return [preview];
  });
}

function extractIdeationTranscript(ideaPlan: Record<string, unknown>): unknown | undefined {
  const brainstorm = toRecord(ideaPlan.brainstorm);
  const sessions = brainstorm.sessions;
  if (!Array.isArray(sessions) || sessions.length === 0) {
    return undefined;
  }
  return sessions.map((session) => {
    const record = toRecord(session);
    return {
      sessionId: record.sessionId,
      ideationNotes: record.ideationNotes,
      transcript: record.transcript
    };
  });
}

function extractBrainstormSynthesisScores(ideaPlan: Record<string, unknown>): unknown | undefined {
  const brainstorm = toRecord(ideaPlan.brainstorm);
  const synthesis = toRecord(brainstorm.synthesis);
  if (Object.keys(synthesis).length === 0) {
    return undefined;
  }
  return {
    priorityScore: synthesis.priorityScore,
    valueScore: synthesis.valueScore,
    riskScore: synthesis.riskScore,
    effortScore: synthesis.effortScore,
    confidenceScore: synthesis.confidenceScore,
    scoredSessions: synthesis.scoredSessions
  };
}

export function buildPlannerPacketFromReads(input: {
  flowStatus: ModuleCommandResult;
  ideaResult?: ModuleCommandResult;
}): ModuleCommandResult {
  if (!input.flowStatus.ok) {
    return input.flowStatus;
  }

  const flowData = toRecord(input.flowStatus.data);
  const packet: PlannerPacketData = {
    responseSchemaVersion: 1,
    packetKind: "planner-bootstrap",
    goldenPathStage: flowData.goldenPathStage,
    ideaCount: flowData.ideaCount,
    blockers: flowData.blockers ?? [],
    mismatches: flowData.mismatches ?? [],
    recommendedNextCommand: flowData.recommendedNextCommand,
    planningGeneration: flowData.planningGeneration,
    planningGenerationPolicy: flowData.planningGenerationPolicy
  };

  for (const key of ["ideaId", "planRef", "planId", "documentStatus", "sessionStatus"] as const) {
    if (flowData[key] !== undefined) {
      packet[key] = flowData[key];
    }
  }

  if (input.ideaResult?.ok) {
    const ideaData = toRecord(input.ideaResult.data);
    const idea = slimIdeaRow(ideaData.idea);
    if (idea) {
      packet.idea = idea;
    }
    const ideaPlan = toRecord(ideaData.ideaPlan);
    if (Object.keys(ideaPlan).length > 0) {
      if (ideaPlan.agentDirective !== undefined) {
        packet.agentDirective = ideaPlan.agentDirective;
      }
      const wbsPreview = buildWbsPreviewRows(ideaPlan.wbs, WBS_PREVIEW_MAX_ROWS);
      if (wbsPreview.length > 0) {
        packet.wbsPreview = wbsPreview;
      }
      const ideationTranscript = extractIdeationTranscript(ideaPlan);
      if (ideationTranscript !== undefined) {
        packet.ideationTranscript = ideationTranscript;
      }
      const brainstormSynthesisScores = extractBrainstormSynthesisScores(ideaPlan);
      if (brainstormSynthesisScores !== undefined) {
        packet.brainstormSynthesisScores = brainstormSynthesisScores;
      }
      if (flowData.sessionStatus !== undefined) {
        packet.session = { status: flowData.sessionStatus };
      }
    }
  } else if (flowData.sessionStatus !== undefined) {
    packet.session = { status: flowData.sessionStatus };
  }

  return {
    ok: true,
    code: "planner-packet",
    message: `Planner packet for stage ${String(flowData.goldenPathStage ?? "unknown")}`,
    data: packet
  };
}

export function applyPlannerPacketTruncationLadder(
  packet: PlannerPacketData,
  byteBudget = MCP_PLANNER_PACKET_OUTPUT_BYTE_BUDGET
): { packet: PlannerPacketData; truncated: boolean; truncationSteps: string[] } {
  const working = structuredClone(packet);
  const truncationSteps: string[] = [];

  const fits = () => Buffer.byteLength(JSON.stringify(working), "utf8") <= byteBudget;

  if (fits()) {
    return { packet: working, truncated: false, truncationSteps };
  }

  if (working.ideationTranscript !== undefined) {
    delete working.ideationTranscript;
    truncationSteps.push("drop-ideation-transcript");
    if (fits()) {
      return { packet: working, truncated: true, truncationSteps };
    }
  }

  if (Array.isArray(working.wbsPreview) && working.wbsPreview.length > WBS_PREVIEW_TRUNCATED_MAX_ROWS) {
    working.wbsPreview = working.wbsPreview.slice(0, WBS_PREVIEW_TRUNCATED_MAX_ROWS);
    truncationSteps.push("reduce-wbs-preview");
    if (fits()) {
      return { packet: working, truncated: true, truncationSteps };
    }
  }

  if (working.brainstormSynthesisScores !== undefined) {
    delete working.brainstormSynthesisScores;
    truncationSteps.push("drop-brainstorm-synthesis-scores");
    if (fits()) {
      return { packet: working, truncated: true, truncationSteps };
    }
  }

  return { packet: working, truncated: truncationSteps.length > 0, truncationSteps };
}

export function validatePlannerPacketArgs(args: Record<string, unknown>): string | null {
  const ideaId = cleanString(args.ideaId ?? args.id);
  if (ideaId && !isIdeaIdShape(ideaId)) {
    return "ideaId must be shaped like I001 when provided";
  }
  return null;
}

export function expansionArgsForPlannerPacket(args: Record<string, unknown>): Record<string, unknown> {
  const ideaId = cleanString(args.ideaId ?? args.id);
  return ideaId ? { ideaId } : {};
}

export async function invokePlannerPacket(
  runtime: ModuleCommandRuntime,
  args: Record<string, unknown>
): Promise<ModuleCommandResult> {
  const flowArgs = expansionArgsForPlannerPacket(args);
  const flowStatus = await runtime.invoke({
    name: "get-planner-flow-status",
    args: flowArgs
  });

  if (!flowStatus.ok) {
    return flowStatus;
  }

  const flowData = toRecord(flowStatus.data);
  const ideaId = cleanString(args.ideaId ?? args.id) ?? cleanString(flowData.ideaId);
  let ideaResult: ModuleCommandResult | undefined;
  if (ideaId) {
    ideaResult = await runtime.invoke({
      name: "get-idea",
      args: { ideaId }
    });
    if (!ideaResult.ok && ideaResult.code !== "idea-not-found") {
      return ideaResult;
    }
  }

  const built = buildPlannerPacketFromReads({ flowStatus, ideaResult });
  if (!built.ok || !built.data) {
    return built;
  }

  const { packet, truncated, truncationSteps } = applyPlannerPacketTruncationLadder(toRecord(built.data));
  const data: PlannerPacketData = {
    ...packet,
    ...(truncated ? { truncated: true, truncationSteps } : {})
  };

  return {
    ok: true,
    code: "planner-packet",
    message: built.message,
    data
  };
}

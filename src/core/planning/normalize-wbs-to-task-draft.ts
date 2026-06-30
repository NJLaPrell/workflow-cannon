import type {
  PlanArtifactGeneratedTaskPayload,
  PlanArtifactPlanningType,
  PlanArtifactWbsItem
} from "./plan-artifact-v1.js";

/**
 * Row shape accepted by `persist-planning-execution-drafts` / `buildTaskFromConversionPayload`.
 * `phase` may be filled by the caller context when omitted on the WBS payload.
 */
export type PlanningExecutionTaskDraft = {
  id?: string;
  title: string;
  type?: string;
  priority?: "P1" | "P2" | "P3";
  phase?: string;
  phaseKey?: string;
  approach: string;
  summary?: string;
  description?: string;
  technicalScope: string[];
  acceptanceCriteria: string[];
  dependsOn?: string[];
  status?: "proposed" | "ready";
  metadata?: Record<string, unknown>;
};

export type NormalizeWbsToTaskDraftContext = {
  planRef: string;
  planId: string;
  planVersion: number;
  planningType: PlanArtifactPlanningType;
  /** Applied when neither payload nor WBS `recommendedPhase` supplies phase text. */
  defaultPhase: string;
  defaultPhaseKey?: string;
  defaultStatus?: "proposed" | "ready";
  sourceIdeaId?: string;
};

export type WbsShapeFinding = {
  code: string;
  message: string;
  field?: string;
};

export type WbsShapeGuardResult =
  | { ok: true; item: PlanArtifactWbsItem }
  | { ok: false; code: "wbs-shape-invalid"; findings: WbsShapeFinding[] };

export type NormalizeWbsToTaskDraftResult =
  | {
      ok: true;
      draft: PlanningExecutionTaskDraft;
      /** Provenance fields for finalize (WP-6); not part of persist argv today. */
      planningProvenance: {
        planId: string;
        planVersion: number;
        wbsId: string;
        wbsPath?: string;
        planRef: string;
        planningType: PlanArtifactPlanningType;
        sourceIdeaId?: string;
        source: "normalize-wbs-to-task-draft";
      };
    }
  | { ok: false; code: "wbs-shape-invalid"; findings: WbsShapeFinding[] };

function nonEmptyStrings(value: unknown, field: string, findings: WbsShapeFinding[]): string[] | null {
  if (!Array.isArray(value) || value.length === 0) {
    findings.push({ code: "wbs-field-empty", message: `${field} must be a non-empty string array`, field });
    return null;
  }
  const out = value.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim());
  if (out.length === 0) {
    findings.push({ code: "wbs-field-empty", message: `${field} must contain at least one non-empty string`, field });
    return null;
  }
  return out;
}

/** Structural guard for WBS rows (schema validation is separate — see plan-artifact JSON Schema). */
export function validatePlanArtifactWbsItemShape(item: unknown): WbsShapeGuardResult {
  const findings: WbsShapeFinding[] = [];
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    return {
      ok: false,
      code: "wbs-shape-invalid",
      findings: [{ code: "wbs-not-object", message: "WBS item must be an object" }]
    };
  }
  const row = item as Record<string, unknown>;
  const requireString = (key: string) => {
    const v = row[key];
    if (typeof v !== "string" || v.trim().length === 0) {
      findings.push({ code: "wbs-field-missing", message: `WBS item requires non-empty '${key}'`, field: key });
      return "";
    }
    return v.trim();
  };

  requireString("wbsId");
  requireString("title");
  requireString("suggestedTaskTitle");
  requireString("approach");
  requireString("doneMeans");
  nonEmptyStrings(row.goalMapping, "goalMapping", findings);
  nonEmptyStrings(row.technicalScope, "technicalScope", findings);
  nonEmptyStrings(row.acceptanceCriteria, "acceptanceCriteria", findings);
  nonEmptyStrings(row.testingVerification, "testingVerification", findings);
  if (!Array.isArray(row.dependsOn)) {
    findings.push({
      code: "wbs-field-missing",
      message: "WBS item requires 'dependsOn' array",
      field: "dependsOn"
    });
  }
  const confidence = row.sizingConfidence;
  if (confidence !== "high" && confidence !== "medium" && confidence !== "low") {
    findings.push({
      code: "wbs-field-invalid",
      message: "WBS item requires sizingConfidence of high, medium, or low",
      field: "sizingConfidence"
    });
  }
  const payload = row.generatedTaskPayload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    findings.push({
      code: "wbs-payload-missing",
      message: "WBS item requires generatedTaskPayload object",
      field: "generatedTaskPayload"
    });
  } else {
    const p = payload as Record<string, unknown>;
    if (typeof p.title !== "string" || !p.title.trim()) {
      findings.push({
        code: "wbs-payload-field-missing",
        message: "generatedTaskPayload requires non-empty title",
        field: "generatedTaskPayload.title"
      });
    }
    if (typeof p.approach !== "string" || !p.approach.trim()) {
      findings.push({
        code: "wbs-payload-field-missing",
        message: "generatedTaskPayload requires approach",
        field: "generatedTaskPayload.approach"
      });
    }
    nonEmptyStrings(p.technicalScope, "generatedTaskPayload.technicalScope", findings);
    nonEmptyStrings(p.acceptanceCriteria, "generatedTaskPayload.acceptanceCriteria", findings);
  }

  if (findings.length > 0) {
    return { ok: false, code: "wbs-shape-invalid", findings };
  }

  return { ok: true, item: item as PlanArtifactWbsItem };
}

export function isPlanArtifactWbsItem(value: unknown): value is PlanArtifactWbsItem {
  return validatePlanArtifactWbsItemShape(value).ok === true;
}

function phaseLabelFromKey(phaseKey: string): string {
  return /^\d+$/.test(phaseKey) ? `Phase ${phaseKey}` : phaseKey;
}

function trimOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function renderBulletSection(title: string, lines: string[]): string {
  return [title, ...lines.map((line) => `- ${line}`)].join("\n");
}

function buildTaskDraftDescription(wbs: PlanArtifactWbsItem, payload: PlanArtifactGeneratedTaskPayload): string {
  const sections = [
    `Plan WBS row: ${wbs.wbsId}${wbs.path ? ` (${wbs.path})` : ""} — ${wbs.title.trim()}`,
    `Approach:\n${wbs.approach.trim()}`,
    renderBulletSection("Goal mapping:", wbs.goalMapping),
    renderBulletSection("Technical scope:", wbs.technicalScope.length > 0 ? wbs.technicalScope : payload.technicalScope),
    renderBulletSection(
      "Acceptance criteria:",
      wbs.acceptanceCriteria.length > 0 ? wbs.acceptanceCriteria : payload.acceptanceCriteria
    ),
    renderBulletSection("Verification:", wbs.testingVerification),
    `Done means:\n${wbs.doneMeans.trim()}`
  ];
  const riskNotes = trimOptionalString(wbs.riskNotes);
  if (riskNotes) {
    sections.push(`Risk notes:\n${riskNotes}`);
  }
  return sections.join("\n\n");
}

/**
 * Stub normalizer (WP-1.3): maps a WBS row to a persist-compatible task draft.
 * Full provenance attachment and id allocation happen in WP-6 finalize.
 */
export function normalizeWbsItemToTaskDraft(
  item: PlanArtifactWbsItem,
  context: NormalizeWbsToTaskDraftContext
): NormalizeWbsToTaskDraftResult {
  const guarded = validatePlanArtifactWbsItemShape(item);
  if (!guarded.ok) {
    return guarded;
  }
  const wbs = guarded.item;
  const payload: PlanArtifactGeneratedTaskPayload = wbs.generatedTaskPayload;

  const phaseKey =
    (typeof payload.phaseKey === "string" && payload.phaseKey.trim()) ||
    (typeof wbs.recommendedPhase === "string" && wbs.recommendedPhase.trim()) ||
    context.defaultPhaseKey;
  const phase =
    (typeof payload.phase === "string" && payload.phase.trim()) ||
    (phaseKey ? phaseLabelFromKey(phaseKey) : context.defaultPhase);
  const sourceIdeaId = trimOptionalString(context.sourceIdeaId);

  const planningProvenance = {
    planId: context.planId,
    planVersion: context.planVersion,
    wbsId: wbs.wbsId,
    wbsPath: wbs.path,
    planRef: context.planRef,
    planningType: context.planningType,
    sourceIdeaId,
    source: "normalize-wbs-to-task-draft" as const
  };

  const draft: PlanningExecutionTaskDraft = {
    id: typeof payload.id === "string" && /^T\d+$/.test(payload.id.trim()) ? payload.id.trim() : undefined,
    title: payload.title.trim(),
    type: payload.type?.trim() || "workspace-kit",
    priority: payload.priority,
    phase,
    phaseKey: phaseKey || undefined,
    approach: payload.approach.trim(),
    summary: trimOptionalString(payload.approach) ?? trimOptionalString(wbs.approach),
    description: buildTaskDraftDescription(wbs, payload),
    technicalScope: [...payload.technicalScope],
    acceptanceCriteria: [...payload.acceptanceCriteria],
    dependsOn: wbs.dependsOn.length > 0 ? [...wbs.dependsOn] : payload.dependsOn ? [...payload.dependsOn] : undefined,
    status: payload.status ?? context.defaultStatus ?? "proposed",
    metadata: {
      planRef: context.planRef,
      planningProvenance
    }
  };

  return {
    ok: true,
    draft,
    planningProvenance
  };
}

import fs from "node:fs";
import path from "node:path";

import type { PlanArtifactRiskItem, PlanArtifactWbsItem } from "./plan-artifact-v1.js";
import { derivePlanDocumentBasename } from "./plan-document-slug.js";
import { scoreBandForKind } from "./brainstorm-score-bands.js";
import type { IdeaPlanDocumentWithPlanningPayload } from "../../modules/ideas/idea-plan-planning-init.js";
import type {
  BrainstormScoreInputs,
  BrainstormSession,
  IdeaPlanDocument
} from "../../modules/ideas/idea-plan-types.js";

export const PLAN_DOCUMENT_VIEW_FILE = "plan-document.view.yaml";
export const PLAN_DOCUMENT_TEMPLATE_FILE = "plan-document.md";
export const PLAN_DOCUMENT_OUTPUT_DIR = "docs/maintainers/plans";

export type PlanDocumentRenderSummary = {
  schemaVersion: 1;
  planId: string;
  ideaId: string;
  status: string;
  version: number;
  title: string;
  outputBasename: string;
  sectionsRendered: string[];
  sectionsSkipped: string[];
};

const PLAN_DOC_MARKER_PREFIX = "<!--PLAN_DOC:";

function resolvePlanTitle(document: IdeaPlanDocument): string {
  const payload = document as IdeaPlanDocumentWithPlanningPayload;
  return payload.identity?.title ?? document.plan?.title ?? "Untitled plan";
}

function bulletList(items: string[]): string {
  if (items.length === 0) {
    return "";
  }
  return items.map((item) => `- ${item}`).join("\n");
}

function statusBadge(status: string): string {
  return `\`${status}\``;
}

function resolveBrainstormSynthesis(document: IdeaPlanDocument): BrainstormScoreInputs | undefined {
  const synthesis = document.brainstorm?.synthesis;
  if (synthesis && Object.keys(synthesis).length > 0) {
    return synthesis;
  }
  const sessions = document.brainstorm?.sessions ?? [];
  const lastScored = [...sessions].reverse().find((s) => s.scores && Object.keys(s.scores).length > 0);
  return lastScored?.scores;
}

function renderScoreRow(label: string, score: number | undefined, kind: "value" | "risk" | "effort" | "confidence" | "priority"): string {
  if (score === undefined || Number.isNaN(score)) {
    return `| ${label} | — | — |`;
  }
  const band = scoreBandForKind(score, kind);
  return `| ${label} | ${score} | **${band}** |`;
}

export function renderPlanDocumentHeader(document: IdeaPlanDocument): string {
  const title = resolvePlanTitle(document);
  const planningType =
    (document as IdeaPlanDocumentWithPlanningPayload).identity?.planningType ?? document.plan?.planningType;
  const summary =
    (document as IdeaPlanDocumentWithPlanningPayload).identity?.summary ?? document.plan?.summary;
  const lines = [
    `# ${title}`,
    "",
    `| Field | Value |`,
    `| --- | --- |`,
    `| Status | ${statusBadge(document.status)} |`,
    `| Idea ID | \`${document.ideaId}\` |`,
    `| Plan ID | \`${document.planId}\` |`,
    `| Version | ${document.version} |`,
    `| planRef | \`${document.planRef}\` |`
  ];
  if (planningType) {
    lines.push(`| Planning type | ${planningType} |`);
  }
  if (summary) {
    lines.push("", summary);
  }
  return lines.join("\n");
}

export function renderPlanDocumentBrainstormSynthesis(document: IdeaPlanDocument): string | null {
  const scores = resolveBrainstormSynthesis(document);
  if (!scores) {
    return null;
  }
  const rows = [
    "| Dimension | Score | Band |",
    "| --- | ---: | --- |",
    renderScoreRow("Value", scores.value, "value"),
    renderScoreRow("Risk", scores.risk, "risk"),
    renderScoreRow("Effort", scores.effort, "effort"),
    renderScoreRow("Confidence", scores.confidence, "confidence"),
    renderScoreRow("Priority", scores.priority, "priority")
  ];
  if (scores.tShirtSize) {
    rows.push(`| T-shirt size | ${scores.tShirtSize} | — |`);
  }
  return `## Brainstorm synthesis\n\n${rows.join("\n")}`;
}

function formatSessionDate(iso: string | undefined): string {
  if (!iso) {
    return "—";
  }
  return iso.slice(0, 19).replace("T", " ");
}

export function renderPlanDocumentBrainstormSessions(document: IdeaPlanDocument): string | null {
  const sessions = document.brainstorm?.sessions ?? [];
  if (sessions.length === 0) {
    return null;
  }
  const rows = sessions.map((session: BrainstormSession, index: number) => {
    const scores = session.scores;
    const priority = scores?.priority ?? "—";
    const value = scores?.value ?? "—";
    const completed = session.completedAt ? "completed" : "in progress";
    return `| ${index + 1} | \`${session.sessionId}\` | ${formatSessionDate(session.startedAt)} | ${completed} | ${value} | ${priority} |`;
  });
  return [
    "## Brainstorm session history",
    "",
    "| # | Session ID | Started | State | Value | Priority |",
    "| ---: | --- | --- | --- | ---: | ---: |",
    ...rows
  ].join("\n");
}

export function renderPlanDocumentPlanGoals(document: IdeaPlanDocument): string | null {
  const payload = document as IdeaPlanDocumentWithPlanningPayload;
  const goals = payload.goals ?? [];
  const nonGoals = payload.nonGoals ?? [];
  if (goals.length === 0 && nonGoals.length === 0 && !document.plan?.summary) {
    return null;
  }
  const parts: string[] = ["## Goals and non-goals", ""];
  if (goals.length > 0) {
    parts.push("### Goals", "", bulletList(goals));
  } else if (document.plan?.summary) {
    parts.push("### Goals", "", `_Planning in progress — ${document.plan.summary}_`);
  }
  if (nonGoals.length > 0) {
    parts.push("", "### Non-goals", "", bulletList(nonGoals));
  }
  return parts.join("\n");
}

export function renderPlanDocumentWbsSummary(document: IdeaPlanDocument): string | null {
  const wbs = (document as IdeaPlanDocumentWithPlanningPayload).wbs ?? [];
  if (wbs.length === 0) {
    if (document.plan?.wbsRowCount && document.plan.wbsRowCount > 0) {
      return `## WBS summary\n\n_WBS row count: ${document.plan.wbsRowCount} (detail not yet materialized on document)._`;
    }
    return null;
  }
  const rows = wbs.map((item: PlanArtifactWbsItem) => {
    const deps = item.dependsOn.length > 0 ? item.dependsOn.join(", ") : "—";
    return `| \`${item.wbsId}\` | ${item.title} | ${item.sizingConfidence} | ${deps} |`;
  });
  return [
    "## WBS summary",
    "",
    "| WBS ID | Title | Sizing | Depends on |",
    "| --- | --- | --- | --- |",
    ...rows
  ].join("\n");
}

export function renderPlanDocumentRiskRegister(document: IdeaPlanDocument): string | null {
  const risks = (document as IdeaPlanDocumentWithPlanningPayload).riskAssessment ?? [];
  if (risks.length === 0) {
    return null;
  }
  const rows = risks.map((risk: PlanArtifactRiskItem) => {
    const mitigation = risk.mitigation ? ` Mitigation: ${risk.mitigation}` : "";
    return `- **${risk.id}** (${risk.severity}): ${risk.description}.${mitigation}`;
  });
  return `## Risk register\n\n${rows.join("\n")}`;
}

export function renderPlanDocumentAssumptions(document: IdeaPlanDocument): string | null {
  const assumptions = (document as IdeaPlanDocumentWithPlanningPayload).assumptions ?? [];
  if (assumptions.length === 0) {
    return null;
  }
  return `## Assumptions\n\n${bulletList(assumptions)}`;
}

export function renderPlanDocumentOpenQuestions(document: IdeaPlanDocument): string | null {
  const openQuestions = (document as IdeaPlanDocumentWithPlanningPayload).openQuestions ?? [];
  if (openQuestions.length === 0) {
    if (document.review?.openQuestionCount && document.review.openQuestionCount > 0) {
      return `## Open questions\n\n_${document.review.openQuestionCount} open question(s) noted at review — detail not yet on document._`;
    }
    return null;
  }
  return `## Open questions\n\n${bulletList(openQuestions)}`;
}

export function renderPlanDocumentReview(document: IdeaPlanDocument): string | null {
  if (!document.review) {
    return null;
  }
  const review = document.review;
  return [
    "## Review",
    "",
    `| Field | Value |`,
    `| --- | --- |`,
    `| Passed | ${review.passed === true ? "yes" : review.passed === false ? "no" : "—"} |`,
    `| Blockers | ${review.blockerCount ?? 0} |`,
    `| Warnings | ${review.warningCount ?? 0} |`,
    `| Open questions | ${review.openQuestionCount ?? 0} |`,
    `| Reviewed at | ${review.reviewedAt ?? "—"} |`
  ].join("\n");
}

export function renderPlanDocumentAcceptance(document: IdeaPlanDocument): string | null {
  if (!document.acceptance) {
    return null;
  }
  const acceptance = document.acceptance;
  return [
    "## Acceptance",
    "",
    `| Field | Value |`,
    `| --- | --- |`,
    `| Accepted at | ${acceptance.acceptedAt ?? "—"} |`,
    `| Accepted by | ${acceptance.acceptedBy ?? "—"} |`,
    `| Accepted version | ${acceptance.acceptedVersion ?? "—"} |`
  ].join("\n");
}

export function renderPlanDocumentDeliveryRefs(document: IdeaPlanDocument): string | null {
  if (!document.delivery) {
    return null;
  }
  const delivery = document.delivery;
  const taskRefs = delivery.taskRefs ?? [];
  const lines = [
    "## Delivery references",
    "",
    `| Field | Value |`,
    `| --- | --- |`,
    `| Delivered at | ${delivery.deliveredAt ?? "—"} |`,
    `| Phase key | ${delivery.phaseKey ?? "—"} |`,
    `| Task count | ${delivery.taskCount ?? taskRefs.length ?? "—"} |`
  ];
  if (taskRefs.length > 0) {
    lines.push("", "**Task refs:**", bulletList(taskRefs.map((id) => `\`${id}\``)));
  }
  return lines.join("\n");
}

export function renderPlanDocumentProvenance(document: IdeaPlanDocument): string {
  const payload = document as IdeaPlanDocumentWithPlanningPayload;
  const provenance = payload.provenance;
  const updatedAt = provenance?.updatedAt ?? document.updatedAt;
  const source = provenance?.source ?? "unified-idea-plan";
  return [
    "---",
    "",
    `_Rendered from unified IdeaPlan v${document.schemaVersion} · status ${document.status} · version ${document.version} · updated ${updatedAt} · source ${source}_`
  ].join("\n");
}

const SECTION_RENDERERS: Record<string, (document: IdeaPlanDocument) => string | null> = {
  header: renderPlanDocumentHeader,
  brainstorm_synthesis: renderPlanDocumentBrainstormSynthesis,
  brainstorm_sessions: renderPlanDocumentBrainstormSessions,
  plan_goals: renderPlanDocumentPlanGoals,
  wbs_summary: renderPlanDocumentWbsSummary,
  risk_register: renderPlanDocumentRiskRegister,
  assumptions: renderPlanDocumentAssumptions,
  open_questions: renderPlanDocumentOpenQuestions,
  review: renderPlanDocumentReview,
  acceptance: renderPlanDocumentAcceptance,
  delivery_refs: renderPlanDocumentDeliveryRefs,
  provenance: (document) => renderPlanDocumentProvenance(document)
};

function parseViewSectionIds(viewYaml: string): string[] {
  const ids: string[] = [];
  let inSections = false;
  for (const line of viewYaml.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "sections:") {
      inSections = true;
      continue;
    }
    if (!inSections) {
      continue;
    }
    if (trimmed.startsWith("render_policies:")) {
      break;
    }
    const idMatch = trimmed.match(/^- id:\s*(.+)$/);
    if (idMatch) {
      ids.push(idMatch[1]!.trim());
    }
  }
  return ids;
}

function loadPlanDocumentTemplate(workspacePath: string): string {
  const templatePath = path.join(
    workspacePath,
    "src/modules/documentation/templates",
    PLAN_DOCUMENT_TEMPLATE_FILE
  );
  return fs.readFileSync(templatePath, "utf8");
}

function loadPlanDocumentView(workspacePath: string): string {
  const viewPath = path.join(workspacePath, "src/modules/documentation/views", PLAN_DOCUMENT_VIEW_FILE);
  return fs.readFileSync(viewPath, "utf8");
}

export function applyPlanDocumentTemplate(template: string, sectionBodies: Record<string, string>): string {
  let output = template;
  for (const [sectionId, body] of Object.entries(sectionBodies)) {
    const marker = `${PLAN_DOC_MARKER_PREFIX}${sectionId}-->`;
    output = output.replace(marker, body.trim().length > 0 ? `${body}\n` : "");
  }
  return output
    .replace(/\n{3,}/g, "\n\n")
    .replace(/<!--PLAN_DOC:[^>]+-->\n?/g, "")
    .trimEnd()
    .concat("\n");
}

export function renderPlanDocumentMarkdown(
  workspacePath: string,
  document: IdeaPlanDocument
): { markdown: string; summary: PlanDocumentRenderSummary } {
  const viewYaml = loadPlanDocumentView(workspacePath);
  const template = loadPlanDocumentTemplate(workspacePath);
  const sectionIds = parseViewSectionIds(viewYaml);
  const title = resolvePlanTitle(document);

  const sectionBodies: Record<string, string> = {};
  const sectionsRendered: string[] = [];
  const sectionsSkipped: string[] = [];

  for (const sectionId of sectionIds) {
    const renderer = SECTION_RENDERERS[sectionId];
    if (!renderer) {
      sectionsSkipped.push(sectionId);
      sectionBodies[sectionId] = "";
      continue;
    }
    const body = renderer(document);
    if (body === null || body.trim().length === 0) {
      sectionsSkipped.push(sectionId);
      sectionBodies[sectionId] = "";
      continue;
    }
    sectionsRendered.push(sectionId);
    sectionBodies[sectionId] = body;
  }

  const markdown = applyPlanDocumentTemplate(template, sectionBodies);
  return {
    markdown,
    summary: {
      schemaVersion: 1,
      planId: document.planId,
      ideaId: document.ideaId,
      status: document.status,
      version: document.version,
      title,
      outputBasename: derivePlanDocumentBasename(document.ideaId, title),
      sectionsRendered,
      sectionsSkipped
    }
  };
}

export function resolvePlanDocumentOutputPath(workspacePath: string, document: IdeaPlanDocument): string {
  const title = resolvePlanTitle(document);
  const basename = derivePlanDocumentBasename(document.ideaId, title);
  return path.join(workspacePath, PLAN_DOCUMENT_OUTPUT_DIR, `${basename}.md`);
}

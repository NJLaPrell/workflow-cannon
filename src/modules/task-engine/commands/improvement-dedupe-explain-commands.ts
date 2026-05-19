import type { ModuleCommandResult, ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import { readLineageEvents } from "../../../core/lineage-store.js";
import {
  CLI_REMEDIATION_DOCS,
  CLI_REMEDIATION_INSTRUCTIONS
} from "../../../core/cli-remediation.js";
import { attachPolicyMeta } from "../attach-planning-response-meta.js";
import type { OpenedPlanningStores } from "../persistence/planning-open.js";
import type { TaskStore } from "../persistence/store.js";
import { isImprovementLikeTask } from "../suggestions.js";
import type { TaskEntity, TaskStatus } from "../types.js";
import { readPlanString } from "./task-intent-commands.js";

export type SimilarityMatch = {
  taskId: string;
  status: TaskStatus;
  title: string;
  evidenceKey: string | null;
  similarityScore: number;
  reasons: string[];
};

export type SimilarityCluster = {
  clusterId: string;
  evidenceKey: string | null;
  matches: SimilarityMatch[];
};

export type DedupeTriageRecommendation = {
  action: "accept" | "reject" | "merge-review" | "defer";
  rationale: string;
  linkedTaskIds: string[];
  remediationCommand?: string;
};

function metaString(task: TaskEntity, key: string): string | null {
  const meta = task.metadata;
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
    return null;
  }
  const v = (meta as Record<string, unknown>)[key];
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

function evidenceKeyFor(task: TaskEntity): string | null {
  return metaString(task, "evidenceKey");
}

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]+/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2)
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) {
    return 0;
  }
  let inter = 0;
  for (const t of a) {
    if (b.has(t)) {
      inter++;
    }
  }
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

function titleSimilarity(a: string, b: string): number {
  return jaccard(tokenize(a), tokenize(b));
}

function issueSimilarity(a: TaskEntity, b: TaskEntity): number {
  const ai = metaString(a, "issue");
  const bi = metaString(b, "issue");
  if (!ai || !bi) {
    return 0;
  }
  return jaccard(tokenize(ai), tokenize(bi));
}

function buildMatch(
  subject: TaskEntity,
  other: TaskEntity,
  reasons: string[],
  score: number
): SimilarityMatch {
  return {
    taskId: other.id,
    status: other.status,
    title: other.title,
    evidenceKey: evidenceKeyFor(other),
    similarityScore: Math.round(score * 1000) / 1000,
    reasons
  };
}

function clusterMatches(matches: SimilarityMatch[]): SimilarityCluster[] {
  const byKey = new Map<string, SimilarityMatch[]>();
  const unkeyed: SimilarityMatch[] = [];
  for (const m of matches) {
    if (m.evidenceKey) {
      const list = byKey.get(m.evidenceKey) ?? [];
      list.push(m);
      byKey.set(m.evidenceKey, list);
    } else {
      unkeyed.push(m);
    }
  }
  const clusters: SimilarityCluster[] = [];
  for (const [evidenceKey, list] of byKey) {
    clusters.push({
      clusterId: `evidence:${evidenceKey}`,
      evidenceKey,
      matches: list.sort((a, b) => b.similarityScore - a.similarityScore)
    });
  }
  if (unkeyed.length > 0) {
    clusters.push({
      clusterId: "title-similarity",
      evidenceKey: null,
      matches: unkeyed.sort((a, b) => b.similarityScore - a.similarityScore)
    });
  }
  return clusters.sort((a, b) => b.matches.length - a.matches.length);
}

function recommendTriage(
  subject: TaskEntity,
  matches: SimilarityMatch[],
  lineageEventCount: number
): DedupeTriageRecommendation {
  const subjectKey = evidenceKeyFor(subject);
  const linkedTaskIds = matches.map((m) => m.taskId);

  const completedDup = matches.find(
    (m) => m.evidenceKey && subjectKey && m.evidenceKey === subjectKey && m.status === "completed"
  );
  if (completedDup) {
    return {
      action: "reject",
      rationale: `Same evidenceKey already completed on ${completedDup.taskId}.`,
      linkedTaskIds: [completedDup.taskId, ...linkedTaskIds.filter((id) => id !== completedDup.taskId)],
      remediationCommand: `pnpm exec wk run reject-improvement '{"taskId":"${subject.id}","expectedPlanningGeneration":<n>,"policyApproval":{"confirmed":true,"rationale":"duplicate evidenceKey"}}'`
    };
  }

  const activeDup = matches.find(
    (m) =>
      m.evidenceKey &&
      subjectKey &&
      m.evidenceKey === subjectKey &&
      (m.status === "proposed" || m.status === "ready" || m.status === "in_progress")
  );
  if (activeDup) {
    return {
      action: "merge-review",
      rationale: `Active task ${activeDup.taskId} shares evidenceKey; compare before accepting.`,
      linkedTaskIds: [activeDup.taskId, ...linkedTaskIds.filter((id) => id !== activeDup.taskId)],
      remediationCommand: `pnpm exec wk run get-task '{"taskId":"${activeDup.taskId}"}'`
    };
  }

  const highTitle = matches.find((m) => m.similarityScore >= 0.55);
  if (highTitle) {
    return {
      action: "merge-review",
      rationale: `High title/issue overlap with ${highTitle.taskId} (${highTitle.status}).`,
      linkedTaskIds,
      remediationCommand: `pnpm exec wk run list-tasks '{"status":"proposed","limit":20}'`
    };
  }

  if (lineageEventCount > 0) {
    return {
      action: "accept",
      rationale: "Lineage recorded for this evidence key; no blocking duplicate cluster found.",
      linkedTaskIds
    };
  }

  return {
    action: "accept",
    rationale: "No strong duplicate signals; safe to triage via normal accept flow.",
    linkedTaskIds,
    remediationCommand: `pnpm exec wk run accept-improvement '{"taskId":"${subject.id}","expectedPlanningGeneration":<n>,"policyApproval":{"confirmed":true,"rationale":"dedupe clear"}}'`
  };
}

export async function buildImprovementDedupeExplain(
  ctx: ModuleLifecycleContext,
  planning: OpenedPlanningStores,
  store: TaskStore,
  args: Record<string, unknown>
): Promise<ModuleCommandResult> {
  const taskId = readPlanString(args, "taskId");
  if (!taskId) {
    return {
      ok: false,
      code: "invalid-run-args",
      message: "improvement-dedupe-explain requires taskId.",
      remediation: { instructionPath: CLI_REMEDIATION_INSTRUCTIONS.improvementDedupeExplain }
    };
  }

  const subject = store.getTask(taskId);
  if (!subject) {
    return {
      ok: false,
      code: "task-not-found",
      message: `Task '${taskId}' not found.`,
      remediation: { instructionPath: CLI_REMEDIATION_INSTRUCTIONS.improvementDedupeExplain }
    };
  }

  if (!isImprovementLikeTask(subject) && subject.type !== "transcript_churn") {
    return {
      ok: false,
      code: "invalid-task-type",
      message: "improvement-dedupe-explain expects improvement or transcript_churn task types.",
      remediation: { instructionPath: CLI_REMEDIATION_INSTRUCTIONS.improvementDedupeExplain }
    };
  }

  const subjectKey = evidenceKeyFor(subject);
  const all = store.getActiveTasks().filter((t) => t.id !== taskId);
  const candidates = all.filter(
    (t) => isImprovementLikeTask(t) || t.type === "transcript_churn" || t.status === "cancelled"
  );

  const matches: SimilarityMatch[] = [];
  for (const other of candidates) {
    const reasons: string[] = [];
    let score = 0;
    const otherKey = evidenceKeyFor(other);
    if (subjectKey && otherKey && subjectKey === otherKey) {
      reasons.push("exact-evidenceKey");
      score = 1;
    }
    const titleScore = titleSimilarity(subject.title, other.title);
    if (titleScore >= 0.35) {
      reasons.push(`title-jaccard:${titleScore.toFixed(2)}`);
      score = Math.max(score, titleScore);
    }
    const issueScore = issueSimilarity(subject, other);
    if (issueScore >= 0.35) {
      reasons.push(`issue-jaccard:${issueScore.toFixed(2)}`);
      score = Math.max(score, issueScore);
    }
    if (reasons.length > 0) {
      matches.push(buildMatch(subject, other, reasons, score));
    }
  }

  const lineageEvents = await readLineageEvents(ctx.workspacePath);
  const lineageForKey = subjectKey
    ? lineageEvents.filter((e) => {
        const p = e.payload as { evidenceKey?: string };
        return p.evidenceKey === subjectKey;
      })
    : lineageEvents.filter((e) => {
        const p = e.payload as { recommendationTaskId?: string };
        return p.recommendationTaskId === taskId;
      });

  const clusters = clusterMatches(matches);
  const recommendation = recommendTriage(subject, matches, lineageForKey.length);
  const planningGeneration = planning.sqliteDual.getPlanningGeneration();

  const data: Record<string, unknown> = {
    schemaVersion: 1,
    taskId,
    taskStatus: subject.status,
    evidenceKey: subjectKey,
    similarityClusters: clusters,
    similarCount: matches.length,
    lineage: {
      eventCount: lineageForKey.length,
      eventTypes: [...new Set(lineageForKey.map((e) => e.eventType))]
    },
    recommendation,
    remediation: {
      instructionPath: CLI_REMEDIATION_INSTRUCTIONS.improvementDedupeExplain,
      docPath: CLI_REMEDIATION_DOCS.agentCliMap
    }
  };
  attachPolicyMeta(data, ctx, planningGeneration);

  return {
    ok: true,
    code: "improvement-dedupe-explain",
    message: `Dedupe explainer for ${taskId}: ${matches.length} similar task(s), triage=${recommendation.action}`,
    data
  };
}

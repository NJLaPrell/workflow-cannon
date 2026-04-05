import fs from "node:fs/promises";
import type { Dirent } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import type { TransitionEvidence } from "../../core/planning/index.js";
import type { EvidenceKind, ConfidenceSignals } from "./confidence.js";
import { computeHeuristicConfidence, priorityForTier, shouldAdmitRecommendation } from "./confidence.js";
import type { ImprovementStateDocument } from "./improvement-state.js";
import { redactTranscriptSnippet } from "./transcript-redaction.js";

export type IngestCandidate = {
  evidenceKind: EvidenceKind;
  evidenceKey: string;
  title: string;
  provenanceRefs: Record<string, string>;
  signals: ConfidenceSignals;
  confidence: ReturnType<typeof computeHeuristicConfidence>;
};

function sha256Hex(s: string): string {
  return crypto.createHash("sha256").update(s, "utf8").digest("hex");
}

function stableEvidenceKey(kind: EvidenceKind, parts: string[]): string {
  return `${kind}:${sha256Hex(parts.join("\0")).slice(0, 40)}`;
}

async function readJsonlLines(filePath: string): Promise<string[]> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return raw.split("\n").filter((l) => l.trim().length > 0);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw e;
  }
}

async function globJsonlRecursive(dir: string, acc: string[] = []): Promise<string[]> {
  let entries: Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return acc;
    throw e;
  }
  for (const ent of entries) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      await globJsonlRecursive(p, acc);
    } else if (ent.isFile() && ent.name.endsWith(".jsonl")) {
      acc.push(p);
    }
  }
  return acc;
}

const FRICTION = /\b(error|fail|broken|hosed|bug|crash|denied|invalid|exception)\b/i;

function scoreTranscriptLine(line: string): number {
  if (!FRICTION.test(line)) return 0;
  let s = 0.45;
  if (/\b(always|again|still|never)\b/i.test(line)) s += 0.15;
  return Math.min(1, s);
}

export async function ingestAgentTranscripts(
  workspacePath: string,
  transcriptsRootRel: string,
  state: ImprovementStateDocument
): Promise<IngestCandidate[]> {
  const root = path.resolve(workspacePath, transcriptsRootRel);
  const files = await globJsonlRecursive(root);
  const out: IngestCandidate[] = [];

  for (const abs of files.sort()) {
    const rel = path.relative(workspacePath, abs);
    const lines = await readJsonlLines(abs);
    const start = state.transcriptLineCursors[rel] ?? 0;
    const slice = lines.slice(start);
    let maxScore = 0;
    let sampleLine = "";
    for (const line of slice) {
      const sc = scoreTranscriptLine(line);
      if (sc > maxScore) {
        maxScore = sc;
        sampleLine = line.slice(0, 200);
      }
    }
    state.transcriptLineCursors[rel] = lines.length;

    if (maxScore === 0) continue;

    const evidenceKey = stableEvidenceKey("transcript", [rel, String(start), String(lines.length)]);
    const signals: ConfidenceSignals = { transcriptFriction: maxScore };
    const confidence = computeHeuristicConfidence("transcript", signals);
    if (!shouldAdmitRecommendation(confidence)) continue;

    out.push({
      evidenceKind: "transcript",
      evidenceKey,
      title: `Reduce friction hinted in transcript (${path.basename(rel)})`,
      provenanceRefs: { transcriptPath: rel, sampleLine: redactTranscriptSnippet(sampleLine) },
      signals,
      confidence
    });
  }
  return out;
}

export function ingestGitDiffBetweenTags(
  workspacePath: string,
  fromTag: string,
  toTag: string
): IngestCandidate | null {
  let names: string;
  try {
    names = execFileSync(
      "git",
      ["-C", workspacePath, "diff", `${fromTag}..${toTag}`, "--name-only"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
    ).trim();
  } catch {
    return null;
  }
  const fileList = names.split("\n").filter(Boolean);
  const churn = Math.min(1, fileList.length / 25);
  const impact = 0.4 + churn * 0.55;
  const evidenceKey = stableEvidenceKey("git_diff", [fromTag, toTag, fileList.slice(0, 30).join(",")]);
  const signals: ConfidenceSignals = { diffImpact: impact };
  const confidence = computeHeuristicConfidence("git_diff", signals);
  if (!shouldAdmitRecommendation(confidence)) return null;

  return {
    evidenceKind: "git_diff",
    evidenceKey,
    title: `Review workflow impact of changes ${fromTag} → ${toTag} (${fileList.length} paths)`,
    provenanceRefs: { fromTag, toTag, pathCount: String(fileList.length) },
    signals,
    confidence
  };
}

export async function ingestPolicyDenials(
  workspacePath: string,
  state: ImprovementStateDocument
): Promise<IngestCandidate[]> {
  const fp = path.join(workspacePath, ".workspace-kit/policy/traces.jsonl");
  const lines = await readJsonlLines(fp);
  const start = state.policyTraceLineCursor;
  const slice = lines.slice(start);
  state.policyTraceLineCursor = lines.length;
  const out: IngestCandidate[] = [];

  for (const line of slice) {
    let rec: Record<string, unknown>;
    try {
      rec = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (rec.allowed !== false) continue;
    const op = typeof rec.operationId === "string" ? rec.operationId : "unknown";
    const ts = typeof rec.timestamp === "string" ? rec.timestamp : "";
    const evidenceKey = stableEvidenceKey("policy_deny", [op, ts, line.slice(0, 120)]);
    const hasRationale = typeof rec.rationale === "string" && (rec.rationale as string).length > 0;
    const policyDenial = hasRationale ? 0.72 : 0.55;
    const signals: ConfidenceSignals = { policyDenial };
    const confidence = computeHeuristicConfidence("policy_deny", signals);
    if (!shouldAdmitRecommendation(confidence)) continue;

    out.push({
      evidenceKind: "policy_deny",
      evidenceKey,
      title: `Soften or document policy friction for ${op}`,
      provenanceRefs: {
        operationId: op,
        traceTimestamp: ts,
        command: typeof rec.command === "string" ? (rec.command as string) : ""
      },
      signals,
      confidence
    });
  }
  return out;
}

export async function ingestConfigMutations(
  workspacePath: string,
  state: ImprovementStateDocument
): Promise<IngestCandidate[]> {
  const fp = path.join(workspacePath, ".workspace-kit/config/mutations.jsonl");
  const lines = await readJsonlLines(fp);
  const start = state.mutationLineCursor;
  const slice = lines.slice(start);
  state.mutationLineCursor = lines.length;
  const out: IngestCandidate[] = [];

  for (const line of slice) {
    let rec: Record<string, unknown>;
    try {
      rec = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (rec.ok === true) continue;
    const ts = typeof rec.timestamp === "string" ? rec.timestamp : "";
    const k = typeof rec.key === "string" ? rec.key : "";
    const evidenceKey = stableEvidenceKey("config_mutation", ["mutations.jsonl", ts, k, String(rec.code ?? "")]);
    const mutationRejection = 0.62;
    const signals: ConfidenceSignals = { mutationRejection };
    const confidence = computeHeuristicConfidence("config_mutation", signals);
    if (!shouldAdmitRecommendation(confidence)) continue;

    out.push({
      evidenceKind: "config_mutation",
      evidenceKey,
      title: `Improve config UX or validation for key ${k || "(unknown)"}`,
      provenanceRefs: { mutationsFile: "mutations.jsonl", timestamp: ts, key: k },
      signals,
      confidence
    });
  }
  return out;
}

export function ingestTaskTransitionFriction(
  transitionLog: TransitionEvidence[],
  state: ImprovementStateDocument
): IngestCandidate[] {
  const start = state.transitionLogLengthCursor;
  const slice = transitionLog.slice(start);
  state.transitionLogLengthCursor = transitionLog.length;

  const counts = new Map<string, number>();
  for (const ev of slice) {
    counts.set(ev.taskId, (counts.get(ev.taskId) ?? 0) + 1);
  }

  const out: IngestCandidate[] = [];
  for (const [taskId, count] of counts) {
    if (count < 4) continue;
    const taskFriction = Math.min(1, 0.38 + count * 0.08);
    const evidenceKey = stableEvidenceKey("task_transition", [taskId, String(count)]);
    const signals: ConfidenceSignals = { taskFriction };
    const confidence = computeHeuristicConfidence("task_transition", signals);
    if (!shouldAdmitRecommendation(confidence)) continue;

    out.push({
      evidenceKind: "task_transition",
      evidenceKey,
      title: `Stabilize transitions for task ${taskId} (high churn: ${count} events)`,
      provenanceRefs: { taskId, transitionEventCount: String(count) },
      signals,
      confidence
    });
  }
  return out;
}

/**
 * @deprecated New recommendations allocate the next **`T###`** (`allocateNextTaskNumericId` in task-engine).
 * Kept for tests and any external callers that still derive stable ids from evidence keys.
 */
export function taskIdForEvidenceKey(evidenceKey: string): string {
  return `imp-${sha256Hex(evidenceKey).slice(0, 14)}`;
}

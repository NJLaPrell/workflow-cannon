import fs from "node:fs/promises";
import type { Dirent } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import type { TransitionEvidence } from "../../core/planning/index.js";
import type { EvidenceKind, ConfidenceResult, ConfidenceSignals } from "./confidence.js";
import {
  resolveConfidenceForHeuristicVersion,
  shouldAdmitForHeuristicVersion
} from "./confidence-heuristic-2.js";
import type { ImprovementStateDocument } from "./improvement-state.js";
import { redactTranscriptSnippet } from "./transcript-redaction.js";
import { analyzeCursorTranscriptLine } from "./transcript-friction.js";

export type ImprovementHeuristicVersion = 1 | 2;

/** Optional scout-origin fields merged into improvement task metadata when present. */
export type ScoutProposalMeta = {
  primaryLens?: string;
  adversarialLens?: string;
  findingType?: string;
  evidenceAnchors?: string[];
  riskNotes?: string;
  noveltyHint?: string;
};

export type IngestCandidate = {
  evidenceKind: EvidenceKind;
  evidenceKey: string;
  title: string;
  provenanceRefs: Record<string, string>;
  signals: ConfidenceSignals;
  confidence: ConfidenceResult;
  scoutMeta?: ScoutProposalMeta;
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

export async function ingestAgentTranscripts(
  workspacePath: string,
  transcriptsRootRel: string,
  state: ImprovementStateDocument,
  heuristicVersion: ImprovementHeuristicVersion = 1
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
    let winningRole = "unknown";
    let winningScoredText = "";
    let frictionHits = 0;
    for (const line of slice) {
      const a = analyzeCursorTranscriptLine(line);
      if (a.score > 0) frictionHits += 1;
      if (a.score > maxScore) {
        maxScore = a.score;
        sampleLine = line.slice(0, 200);
        winningRole = a.role;
        winningScoredText = a.scoredText.slice(0, 500);
      }
    }
    state.transcriptLineCursors[rel] = lines.length;

    if (maxScore === 0) continue;

    const evidenceKey = stableEvidenceKey("transcript", [rel, String(start), String(lines.length)]);
    const signals: ConfidenceSignals = { transcriptFriction: maxScore };
    const confidence = resolveConfidenceForHeuristicVersion(heuristicVersion, "transcript", signals);
    if (!shouldAdmitForHeuristicVersion(heuristicVersion, confidence)) continue;

    const linesScanned = String(slice.length);
    const pipelineAdmissionSummary = [
      `Scanned **${slice.length}** new JSONL line(s) in this ingest window.`,
      `**${frictionHits}** line(s) matched friction keywords in extracted message text (not raw JSON noise).`,
      `Strongest signal is from a **${winningRole}** turn (see **metadata.provenanceRefs.scoredTextExcerpt** for the text that drove scoring).`,
      "This row is a **proposed** improvement: validate in triage—**cancel** if the session is benign or already addressed."
    ].join(" ");

    out.push({
      evidenceKind: "transcript",
      evidenceKey,
      title: `Reduce friction hinted in transcript (${path.basename(rel)})`,
      provenanceRefs: {
        transcriptPath: rel,
        sampleLine: redactTranscriptSnippet(sampleLine),
        scoredTextExcerpt: redactTranscriptSnippet(winningScoredText.slice(0, 400)),
        transcriptRole: winningRole,
        linesScannedInSlice: linesScanned,
        frictionHitsInSlice: String(frictionHits),
        pipelineAdmissionSummary
      },
      signals,
      confidence
    });
  }
  return out;
}

export function ingestGitDiffBetweenTags(
  workspacePath: string,
  fromTag: string,
  toTag: string,
  heuristicVersion: ImprovementHeuristicVersion = 1
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
  const confidence = resolveConfidenceForHeuristicVersion(heuristicVersion, "git_diff", signals);
  if (!shouldAdmitForHeuristicVersion(heuristicVersion, confidence)) return null;

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
  state: ImprovementStateDocument,
  heuristicVersion: ImprovementHeuristicVersion = 1
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
    const confidence = resolveConfidenceForHeuristicVersion(heuristicVersion, "policy_deny", signals);
    if (!shouldAdmitForHeuristicVersion(heuristicVersion, confidence)) continue;

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
  state: ImprovementStateDocument,
  heuristicVersion: ImprovementHeuristicVersion = 1
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
    const confidence = resolveConfidenceForHeuristicVersion(heuristicVersion, "config_mutation", signals);
    if (!shouldAdmitForHeuristicVersion(heuristicVersion, confidence)) continue;

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
  state: ImprovementStateDocument,
  heuristicVersion: ImprovementHeuristicVersion = 1
): IngestCandidate[] {
  const start = state.transitionLogLengthCursor;
  const slice = transitionLog.slice(start);
  state.transitionLogLengthCursor = transitionLog.length;

  const eventsByTask = new Map<string, TransitionEvidence[]>();
  for (const ev of slice) {
    const list = eventsByTask.get(ev.taskId) ?? [];
    list.push(ev);
    eventsByTask.set(ev.taskId, list);
  }

  const out: IngestCandidate[] = [];
  for (const [taskId, events] of eventsByTask) {
    const count = events.length;
    if (count < 4) continue;
    const taskFriction = Math.min(1, 0.38 + count * 0.08);
    const evidenceKey = stableEvidenceKey("task_transition", [taskId, String(count)]);
    const signals: ConfidenceSignals = { taskFriction };
    const confidence = resolveConfidenceForHeuristicVersion(heuristicVersion, "task_transition", signals);
    if (!shouldAdmitForHeuristicVersion(heuristicVersion, confidence)) continue;

    const digest = events
      .slice(-10)
      .map((e) => `${e.timestamp.slice(11, 19)} ${e.fromState}→${e.toState}(${e.action})`)
      .join(" | ");
    const pipelineAdmissionSummary = [
      `**${count}** lifecycle transition(s) for **${taskId}** appeared in this ingest window.`,
      "Churn usually means retries, scope thrash, policy **`run-transition`** loops, or maintainer doc task activity—use the digest below to see the **actual sequence** before deciding if product/docs work is warranted.",
      "This row is **proposed**: **cancel** if the pattern is expected (e.g. routine doc edits); **accept** to **ready** only when you want execution-time attention."
    ].join(" ");

    out.push({
      evidenceKind: "task_transition",
      evidenceKey,
      title: `Stabilize transitions for task ${taskId} (high churn: ${count} events)`,
      provenanceRefs: {
        taskId,
        transitionEventCount: String(count),
        transitionDigest: digest.slice(0, 1200),
        pipelineAdmissionSummary
      },
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

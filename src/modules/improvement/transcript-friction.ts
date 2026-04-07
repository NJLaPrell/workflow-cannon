/**
 * Deterministic transcript friction scoring for improvement ingest.
 * Scores **extracted message text** (Cursor-style JSONL), not the raw JSON line, to avoid
 * keyword hits inside metadata/URLs; drops common assistant “work summary” noise.
 */

import { HEURISTIC_1_ADMISSION_THRESHOLD } from "./confidence.js";

const FRICTION = /\b(error|fail|failed|broken|hosed|bug|crash|denied|invalid|exception)\b/i;

/** Assistant wrap-ups that are usually not actionable product friction. */
const ASSISTANT_SUCCESS_BOILERPLATE =
  /\bhere'?s what (landed|changed|got done|we (did|shipped|fixed))\b|\bfixes on top of\b|\bwhat got done,?\s+end to end\b|\b(summary|recap)\b.*\b(done|shipped|complete)\b/i;

/** Strong signals we still care about on assistant turns. */
const STRONG_ASSISTANT_FRICTION =
  /\b(policy.?denied|policyapproval|operationId|ELIFECYCLE|traceback|exception:\s|TypeError|undefined is not|failed with exit code|npm ERR!|ENOENT|EACCES)\b/i;

const WEAK_ASSISTANT_SCORE_CAP = Math.max(0, HEURISTIC_1_ADMISSION_THRESHOLD - 0.02);

export type TranscriptLineAnalysis = {
  score: number;
  role: string;
  /** Extracted plain text used for scoring (subset of message). */
  scoredText: string;
  skipReason?: string;
};

/**
 * Pull role + human-visible text from common Cursor agent-transcript JSONL shapes.
 */
export function extractRoleAndText(line: string): { role: string; text: string } {
  try {
    const o = JSON.parse(line) as Record<string, unknown>;
    const role = typeof o.role === "string" ? o.role.toLowerCase() : "unknown";
    let text = "";
    if (typeof o.text === "string") text = o.text;
    else if (o.message && typeof o.message === "object") {
      const m = o.message as Record<string, unknown>;
      const content = m.content;
      if (Array.isArray(content)) {
        const parts: string[] = [];
        for (const c of content) {
          if (c && typeof c === "object") {
            const co = c as Record<string, unknown>;
            if (typeof co.text === "string") parts.push(co.text);
          }
        }
        text = parts.join("\n");
      }
    }
    return { role, text: text.trim().length > 0 ? text : line };
  } catch {
    return { role: "unknown", text: line };
  }
}

/**
 * Score a single JSONL line. Returns score 0 when the line should not contribute to friction.
 */
export function analyzeCursorTranscriptLine(line: string): TranscriptLineAnalysis {
  const { role, text } = extractRoleAndText(line);
  const scoredText = text;
  if (!FRICTION.test(text)) {
    return { score: 0, role, scoredText };
  }
  let s = 0.45;
  if (/\b(always|again|still|never)\b/i.test(text)) s += 0.15;
  s = Math.min(1, s);

  if (role === "assistant") {
    if (ASSISTANT_SUCCESS_BOILERPLATE.test(text) && !STRONG_ASSISTANT_FRICTION.test(text)) {
      return { score: 0, role, scoredText, skipReason: "assistant-success-summary" };
    }
    if (!STRONG_ASSISTANT_FRICTION.test(text)) {
      s = Math.min(s, WEAK_ASSISTANT_SCORE_CAP);
    }
  }

  return { score: s, role, scoredText };
}

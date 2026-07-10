/**
 * CAE agentSignals parsing for friction → file-bug-report guidance (T100859).
 * Advisory wiring only — does not grant ready-task or release powers.
 */

import type { CaeEvaluationContextAgentSignals } from "../../core/cae/evaluation-context-types.js";

const FAILURE_KIND_MAX = 64;
const ERROR_CODE_MAX = 128;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function clampInt(value: unknown, max = 100_000): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const n = Math.floor(value);
  if (n < 0) return undefined;
  return Math.min(max, n);
}

function clampStr(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const t = value.trim();
  if (!t.length) return undefined;
  return t.length <= max ? t : t.slice(0, max);
}

/**
 * Normalize optional `cae-guidance-preview` `agentSignals` args into evaluation-context shape.
 * Returns null when empty/invalid so callers omit the field.
 */
export function parsePreviewAgentSignals(raw: unknown): CaeEvaluationContextAgentSignals | null {
  const rec = asRecord(raw);
  if (!rec) return null;
  const out: CaeEvaluationContextAgentSignals = {};
  const recentToolFailures = clampInt(rec.recentToolFailures);
  if (recentToolFailures !== undefined) out.recentToolFailures = recentToolFailures;
  const consecutiveRetries = clampInt(rec.consecutiveRetries);
  if (consecutiveRetries !== undefined) out.consecutiveRetries = consecutiveRetries;
  const lastErrorCode = clampStr(rec.lastErrorCode, ERROR_CODE_MAX);
  if (lastErrorCode) out.lastErrorCode = lastErrorCode;
  const lastFailureKind = clampStr(rec.lastFailureKind, FAILURE_KIND_MAX);
  if (lastFailureKind) out.lastFailureKind = lastFailureKind;
  return Object.keys(out).length > 0 ? out : null;
}

/** Artifact / activation ids owned by the agent bug-filing CAE slice. */
export const AGENT_BUG_FILING_ARTIFACT_ID = "cae.runbook.agent-bug-filing-nudge";
export const AGENT_BUG_FILING_ACTIVATION_TOOL_FAILURES =
  "cae.activation.do.agent-bug-filing-tool-failures";
export const AGENT_BUG_FILING_ACTIVATION_FRICTION_KIND =
  "cae.activation.do.agent-bug-filing-friction-kind";

/** Host-agnostic next-step copy that must appear on do-family cards. */
export const AGENT_BUG_FILING_NEXT_STEP =
  "Spawn wc-bug-reporter (wc-bug-report skill) then file-bug-report — proposed improvement only; never ready/release.";

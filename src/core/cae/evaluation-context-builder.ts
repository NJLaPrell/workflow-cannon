/**
 * Builds `CaeEvaluationContext` (T859) from bounded inputs — no SQLite, no raw env.
 * Sources: `.ai/cae/evaluation-context.md`, `schemas/cae/evaluation-context.v1.json`.
 */

import type {
  CaeEvaluationContext,
  CaeEvaluationContextCommand,
  CaeEvaluationContextGovernance,
  CaeEvaluationContextQueue,
  CaeEvaluationContextTask,
  CaeEvaluationContextWorkspace,
  CaeTaskMetadataAllowlisted,
  CaeTaskStatus
} from "./evaluation-context-types.js";

/** Sentinel when no task row is active; still satisfies `^T[0-9]{3,}$`. */
export const CAE_GLOBAL_TASK_ID = "T000";

const TITLE_MAX = 512;
const ARGV_SUMMARY_MAX = 512;
const TAG_MAX = 32;
const FEATURE_MAX = 32;
const STR_TAG_LEN = 64;
const STR_META = 256;
const ARG_HINT_MAX = 64;
const ARG_HINT_DEPTH_MAX = 6;

const ALLOW_META = new Set([
  "specPath",
  "caePhase",
  "phaseProgram",
  "programContextPath",
  "risk"
]);

export type TaskEngineTaskRowSlice = {
  id: string;
  status: string;
  phaseKey?: string | null;
  title?: string | null;
  tags?: string[] | null;
  features?: string[] | null;
  metadata?: Record<string, unknown> | null;
};

export type BuildEvaluationContextInput = {
  /** When omitted, uses {@link CAE_GLOBAL_TASK_ID} and neutral status. */
  taskRow?: TaskEngineTaskRowSlice | null;
  command: {
    name: string;
    moduleId?: string | null;
    /** Raw argv object (e.g. `wk run` JSON); summarized — never copied verbatim when oversized. */
    args?: Record<string, unknown> | null;
    argvSummary?: string | null;
  };
  workspace: CaeEvaluationContextWorkspace;
  governance: CaeEvaluationContextGovernance;
  queue: CaeEvaluationContextQueue;
};

export class CaeEvaluationContextBuilderError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "CaeEvaluationContextBuilderError";
    this.code = code;
  }
}

function clampStr(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max);
}

function normalizePhaseKey(raw: string | null | undefined, fallback: string): string {
  const v = (raw ?? "").trim();
  if (v.length === 0) return fallback;
  return v;
}

function asTaskStatus(raw: string | undefined): CaeTaskStatus {
  const allowed: CaeTaskStatus[] = [
    "proposed",
    "ready",
    "in_progress",
    "blocked",
    "completed",
    "cancelled"
  ];
  if (raw && (allowed as string[]).includes(raw)) return raw as CaeTaskStatus;
  return "ready";
}

function pickAllowlistedMetadata(
  metadata: Record<string, unknown> | null | undefined
): CaeTaskMetadataAllowlisted | undefined {
  if (!metadata || typeof metadata !== "object") return undefined;
  const out: CaeTaskMetadataAllowlisted = {};
  for (const key of Object.keys(metadata)) {
    if (!ALLOW_META.has(key)) {
      throw new CaeEvaluationContextBuilderError(
        "cae-context-metadata-unknown-key",
        `task.metadata key not allowlisted for CAE context: ${key}`
      );
    }
    const val = metadata[key];
    if (val === undefined) continue;
    if (key === "risk") {
      if (val === "low" || val === "medium" || val === "high") {
        out.risk = val;
      }
      continue;
    }
    if (typeof val === "string") {
      const s = clampStr(val, STR_META);
      if (key === "specPath") out.specPath = s;
      else if (key === "caePhase") out.caePhase = s;
      else if (key === "phaseProgram") out.phaseProgram = s;
      else if (key === "programContextPath") out.programContextPath = s;
    }
  }
  return Object.keys(out).length ? out : undefined;
}

function clampStringArray(arr: string[] | null | undefined, maxItems: number, itemMax: number): string[] | undefined {
  if (!arr?.length) return undefined;
  const next = arr.slice(0, maxItems).map((s) => clampStr(String(s), itemMax));
  return next.length ? next : undefined;
}

/**
 * Derive a bounded argv summary: drops `policyApproval`, omits nested blobs when too long.
 */
export function deriveArgvSummary(args: Record<string, unknown> | null | undefined): string | undefined {
  if (!args || typeof args !== "object") return undefined;
  const { policyApproval: _p, ...rest } = args;
  try {
    const s = JSON.stringify(rest);
    if (s.length <= ARGV_SUMMARY_MAX) return s;
    return clampStr(s, ARGV_SUMMARY_MAX);
  } catch {
    return undefined;
  }
}

function collectArgHints(
  value: unknown,
  prefix: string,
  depth: number,
  out: Record<string, string | number | boolean | null>
): void {
  if (Object.keys(out).length >= ARG_HINT_MAX || depth > ARG_HINT_DEPTH_MAX) return;
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    if (prefix) {
      out[prefix] = typeof value === "string" ? clampStr(value, STR_META) : value;
    }
    return;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))) {
    if (key === "policyApproval" || !/^[A-Za-z0-9_-]+$/.test(key)) continue;
    const path = prefix ? `${prefix}.${key}` : key;
    collectArgHints(child, path, depth + 1, out);
    if (Object.keys(out).length >= ARG_HINT_MAX) return;
  }
}

export function deriveArgHints(
  args: Record<string, unknown> | null | undefined
): Record<string, string | number | boolean | null> | undefined {
  if (!args || typeof args !== "object") return undefined;
  const hints: Record<string, string | number | boolean | null> = {};
  collectArgHints(args, "", 1, hints);
  return Object.keys(hints).length > 0 ? hints : undefined;
}

function buildTaskSlice(input: BuildEvaluationContextInput): CaeEvaluationContextTask {
  const phaseFallback = input.workspace.currentKitPhase;
  const row = input.taskRow;
  if (!row?.id) {
    return {
      taskId: CAE_GLOBAL_TASK_ID,
      status: "ready",
      phaseKey: normalizePhaseKey(null, phaseFallback)
    };
  }
  const meta = pickAllowlistedMetadata(row.metadata ?? undefined);
  const slice: CaeEvaluationContextTask = {
    taskId: row.id,
    status: asTaskStatus(row.status),
    phaseKey: normalizePhaseKey(row.phaseKey ?? null, phaseFallback)
  };
  if (row.title) slice.title = clampStr(row.title, TITLE_MAX);
  const tags = clampStringArray(row.tags ?? undefined, TAG_MAX, STR_TAG_LEN);
  if (tags) slice.tags = tags;
  const features = clampStringArray(row.features ?? undefined, FEATURE_MAX, STR_TAG_LEN);
  if (features) slice.features = features;
  if (meta) slice.metadata = meta;
  return slice;
}

function buildCommandSlice(input: BuildEvaluationContextInput): CaeEvaluationContextCommand {
  const name = input.command.name.trim() || "__idle__";
  const cmd: CaeEvaluationContextCommand = { name };
  if (input.command.moduleId) {
    cmd.moduleId = clampStr(String(input.command.moduleId), 64);
  }
  const summary =
    input.command.argvSummary != null && input.command.argvSummary !== ""
      ? clampStr(String(input.command.argvSummary), ARGV_SUMMARY_MAX)
      : deriveArgvSummary(input.command.args ?? undefined);
  if (summary) cmd.argvSummary = summary;
  const argHints = deriveArgHints(input.command.args ?? undefined);
  if (argHints) cmd.argHints = argHints;
  return cmd;
}

/**
 * Materialize v1 evaluation context. Does not perform JSON Schema validation (callers may Ajv in tests).
 */
export function buildEvaluationContext(input: BuildEvaluationContextInput): CaeEvaluationContext {
  const workspace: CaeEvaluationContextWorkspace = {
    currentKitPhase: input.workspace.currentKitPhase.trim(),
    nextKitPhase:
      input.workspace.nextKitPhase === undefined ? undefined : input.workspace.nextKitPhase,
    workspaceRootFingerprint: input.workspace.workspaceRootFingerprint
      ? clampStr(input.workspace.workspaceRootFingerprint, 128)
      : undefined
  };

  const ctx: CaeEvaluationContext = {
    schemaVersion: 1,
    task: buildTaskSlice(input),
    command: buildCommandSlice(input),
    workspace,
    governance: { ...input.governance },
    queue: {
      readyQueueDepth: Math.min(100_000, Math.max(0, Math.floor(input.queue.readyQueueDepth))),
      suggestedNextTaskId:
        input.queue.suggestedNextTaskId === undefined ? undefined : input.queue.suggestedNextTaskId
    },
    mapSignals: null
  };

  if (ctx.governance.policySurface) {
    ctx.governance.policySurface = clampStr(ctx.governance.policySurface, 64);
  }

  return ctx;
}

/**
 * Deterministic JSON string for hashing (T860): lexicographic key sort, no whitespace.
 * Not full JCS — documented here for bundleId alignment until JCS dependency lands.
 */
export function canonicalizeEvaluationContextForHash(ctx: CaeEvaluationContext): string {
  const sorted = sortJsonValue(ctx);
  return JSON.stringify(sorted);
}

function sortJsonValue(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(sortJsonValue);
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort((a, b) => a.localeCompare(b));
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    out[k] = sortJsonValue(obj[k]);
  }
  return out;
}

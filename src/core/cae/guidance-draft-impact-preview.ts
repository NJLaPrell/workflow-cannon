/**
 * In-memory Guidance draft overlay + sampled impacts (read-only — no kit registry writes).
 */

import fs from "node:fs";
import path from "node:path";

import {
  BUILTIN_RUN_COMMAND_MANIFEST,
  type BuiltinRunCommandManifestRow
} from "../../contracts/builtin-run-command-manifest.js";
import { evaluateActivationBundle } from "./cae-evaluate.js";
import type { CaeEvaluateMode } from "./cae-evaluate.js";
import {
  countReadyTasksInPlanningSqlite,
  listImpactPreviewPlanningTasks,
  type ImpactPreviewPlanningTaskRow
} from "./cae-queue-snapshot.js";
import { buildEvaluationContext, type TaskEngineTaskRowSlice } from "./evaluation-context-builder.js";
import type { CaeEvaluationContext } from "./evaluation-context-types.js";
import { hydrateTaskRowForCae, inferApprovalTierHint } from "./cae-run-preflight.js";
import {
  appendValidatedCaeRegistryOverlay,
  type CaeLoadedRegistry,
  validateSingleCaeActivationRecord,
  validateSingleCaeArtifactRecord,
} from "./cae-registry-load.js";
import { buildGuidanceScopeDraft, GUIDANCE_SCOPE_PRESETS } from "./guidance-scope-builder.js";
import type { GuidanceScopeBuildResult, GuidanceScopeDraft } from "./guidance-scope-builder.js";
import { isSensitiveModuleCommandForEffective } from "../policy.js";

export const PREVIEW_DRAFT_ARTIFACT_ID = "cae.preview.draft.artifact";
export const PREVIEW_DRAFT_ACTIVATION_ID = "cae.preview.draft.activation";

const DEFAULT_PREVIEW_DRAFT_REF = ".ai/README.md";

export type DraftGuidanceRuleInputV1 = {
  schemaVersion: 1;
  title: string;
  artifactType?: string;
  /** Repo-relative `ref.path` — file must exist under workspace root. Defaults to `.ai/README.md`. */
  refPath?: string;
  family: "policy" | "think" | "do" | "review";
  priority: number;
  scopeDraft: unknown;
  acknowledgement?: {
    strength: "none" | "surface" | "recommend" | "ack_required" | "satisfy_required";
    token: string;
  };
};

export type PreviewPrimaryInput = {
  label?: string;
  commandName: string;
  moduleId?: string;
  taskId?: string;
  commandArgs?: Record<string, unknown>;
  argvSummary?: string;
};

export type DraftImpactSampleKind =
  | "primary"
  | "contrast_workflow"
  | "broad_drift"
  | "completing_task_flow"
  | "planning_task";

export type DraftImpactSampleRowV1 = {
  schemaVersion: 1;
  label: string;
  sampleKind?: DraftImpactSampleKind;
  commandName: string;
  taskId?: string;
  baselineFamilyCounts: { policy: number; think: number; do: number; review: number };
  overlayFamilyCounts: { policy: number; think: number; do: number; review: number };
  draftVisibleInOverlay: boolean;
};

/** Product-facing mapping of authoring scope presets to coarse blast buckets (T1002). */
export type BlastRadiusScopeBucket =
  | "always_global"
  | "workflow_intent"
  | "phase"
  | "task_selector"
  | "task_tag"
  | "completing_task"
  | "advanced_command"
  | "unknown_custom";

export type BlastRadiusSummaryV1 = {
  schemaVersion: 1;
  draftScopeCategory: BlastRadiusScopeBucket;
  totalSamplesEvaluated: number;
  samplesWhereDraftMatched: number;
  representativeMatchedLabels: string[];
  planningTasksIncluded: number;
  /** Counts of samples (where the draft surfaced) keyed by DraftImpactSampleKind */
  tallyBySampleKindWhereDraftMatched: Partial<Record<DraftImpactSampleKind, number>>;
};

export type ActivationReadinessReasonV1 = {
  code: string;
  message: string;
  severity: "info" | "warn" | "block";
};

export type ActivationReadinessV1 = {
  schemaVersion: 1;
  /** Conservative enablement posture before publishing a Guidance version */
  level: "ok" | "warning" | "stop_confirm";
  reasons: ActivationReadinessReasonV1[];
  primaryPreviewTraceId: string;
  conflictEntryCount: number;
  conflictsInvolvingDraft: number;
  sameFamilyConflictSubset: Record<string, unknown>[];
  usefulnessSignal: "absent" | "useful" | "noisy";
  overlayPendingAckCount: number;
  baselinePendingAckCount: number;
  acknowledgementDelta: number;
};

export type GuidanceDraftImpactV1 = {
  schemaVersion: 1;
  draftArtifactId: string;
  draftActivationId: string;
  scopePreset: GuidanceScopeBuildResult["preset"] | "unknown";
  scopePlainSummary: string;
  overlayRegistryDigestSnippet: string;
  scopeWarnings: GuidanceScopeBuildResult["warnings"];
  scopeErrors: GuidanceScopeBuildResult["errors"];
  broadScopeWarnings: { code: string; message: string }[];
  primarySampleLabel: string;
  samples: DraftImpactSampleRowV1[];
  blastRadiusSummary: BlastRadiusSummaryV1;
  activationReadiness: ActivationReadinessV1;
};


const ACK_LEVELS = ["none", "surface", "recommend", "ack_required", "satisfy_required"] as const;

/** Validates authoring JSON for `cae-guidance-preview` `{ draftRule: ... }`. */
export function coerceDraftGuidanceRuleInput(
  raw: unknown
): { ok: false; code: string; message: string } | { ok: true; value: DraftGuidanceRuleInputV1 } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, code: "invalid-args", message: "draftRule must be a JSON object." };
  }
  const r = raw as Record<string, unknown>;
  if (r.schemaVersion !== 1) {
    return { ok: false, code: "invalid-args", message: "draftRule.schemaVersion must be 1." };
  }
  const title =
    typeof r.title === "string" && r.title.trim().length > 0
      ? r.title.trim().slice(0, 256)
      : "";
  if (!title.length) {
    return { ok: false, code: "invalid-args", message: "draftRule.title is required." };
  }
  if (r.family !== "policy" && r.family !== "think" && r.family !== "do" && r.family !== "review") {
    return { ok: false, code: "invalid-args", message: "draftRule.family must be policy|think|do|review." };
  }
  const pr = typeof r.priority === "number" ? r.priority : Number(r.priority ?? NaN);
  if (!Number.isFinite(pr) || pr < 0 || pr > 9999) {
    return { ok: false, code: "invalid-args", message: "draftRule.priority must be a number between 0 and 9999." };
  }
  if (!r.scopeDraft || typeof r.scopeDraft !== "object" || Array.isArray(r.scopeDraft)) {
    return { ok: false, code: "invalid-args", message: "draftRule.scopeDraft must be a Guidance scope preset object." };
  }

  let acknowledgement: DraftGuidanceRuleInputV1["acknowledgement"];
  const ak = r.acknowledgement;
  if (ak !== undefined && ak !== null) {
    if (typeof ak !== "object" || Array.isArray(ak)) {
      return { ok: false, code: "invalid-args", message: "draftRule.acknowledgement must be an object when present." };
    }
    const ar = ak as Record<string, unknown>;
    const strength = ar.strength;
    const tok = typeof ar.token === "string" ? ar.token.trim() : "";
    if (
      typeof strength !== "string" ||
      !ACK_LEVELS.some((lev) => lev === strength) ||
      tok.length === 0 ||
      tok.length > 128
    ) {
      return {
        ok: false,
        code: "invalid-args",
        message: "draftRule.acknowledgement needs strength (none…satisfy_required) and a non-empty token."
      };
    }
    acknowledgement = { strength: strength as (typeof ACK_LEVELS)[number], token: tok };
  }

  let artifactType: string | undefined;
  if (r.artifactType !== undefined && r.artifactType !== null) {
    if (typeof r.artifactType !== "string") {
      return { ok: false, code: "invalid-args", message: "draftRule.artifactType must be a string when present." };
    }
    artifactType = r.artifactType.trim();
  }

  let refPath: string | undefined;
  if (r.refPath !== undefined && r.refPath !== null) {
    if (typeof r.refPath !== "string") {
      return { ok: false, code: "invalid-args", message: "draftRule.refPath must be a repo-relative string when present." };
    }
    refPath = r.refPath.trim();
  }

  return {
    ok: true,
    value: {
      schemaVersion: 1,
      title,
      family: r.family as DraftGuidanceRuleInputV1["family"],
      priority: Math.floor(pr),
      scopeDraft: r.scopeDraft,
      ...(artifactType ? { artifactType } : {}),
      ...(refPath ? { refPath } : {}),
      ...(acknowledgement ? { acknowledgement } : {})
    }
  };
}

export function builtinManifestRowForCommand(name: string): BuiltinRunCommandManifestRow | undefined {
  return BUILTIN_RUN_COMMAND_MANIFEST.find((row) => row.name === name);
}

export function resolveBuiltinModuleId(commandName: string, fallback?: string): string {
  if (fallback?.trim()?.length) return fallback.trim();
  return builtinManifestRowForCommand(commandName)?.moduleId ?? "";
}

function broadScopeDescriptor(preset: GuidanceScopeDraft["preset"] | unknown): { broad?: boolean } | undefined {
  const p = preset as GuidanceScopeDraft["preset"];
  return GUIDANCE_SCOPE_PRESETS.find((d) => d.preset === p);
}

export function collectBroadScopeWarnings(scopeBuild: GuidanceScopeBuildResult): { code: string; message: string }[] {
  const out: { code: string; message: string }[] = [];
  const desc = broadScopeDescriptor(scopeBuild.preset);
  if (desc?.broad) {
    out.push({
      code: "cae-draft-broad-scope-preset",
      message: `Preset ${String(scopeBuild.preset)} matches very widely; double-check unintended overlap.`
    });
  }
  for (const w of scopeBuild.warnings) {
    if (w.code.startsWith("broad") || w.code === "broad-scope-warning") {
      out.push({ code: w.code, message: w.message });
    }
  }
  return out;
}

function familyCountsFromBundle(bundle: Record<string, unknown>): {
  policy: number;
  think: number;
  do: number;
  review: number;
} {
  const families = bundle.families as Record<string, unknown[]> | undefined;
  const count = (fam: "policy" | "think" | "do" | "review") =>
    Array.isArray(families?.[fam]) ? families[fam]!.length : 0;
  return {
    policy: count("policy"),
    think: count("think"),
    do: count("do"),
    review: count("review")
  };
}

function overlayBundleShowsDraft(bundle: Record<string, unknown>): boolean {
  const families = bundle.families as Record<string, { activationId?: string }[]> | undefined;
  if (!families) return false;
  for (const fam of ["policy", "think", "do", "review"] as const) {
    const rows = families[fam];
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      if (String(row?.activationId ?? "") === PREVIEW_DRAFT_ACTIVATION_ID) return true;
    }
  }
  return false;
}

function assertRepoRelativeRef(workspaceRoot: string, rel: string): string {
  const resolved = path.resolve(workspaceRoot, rel);
  const root = path.resolve(workspaceRoot);
  const relPath = path.relative(root, resolved);
  if (relPath.startsWith("..") || path.isAbsolute(relPath)) {
    throw new Error(`cae-draft-artifact-ref-invalid: Artifact ref must stay inside workspace root (${rel}).`);
  }
  if (!fs.existsSync(resolved)) {
    throw new Error(`cae-draft-artifact-ref-missing: File not found for draft artifact (${rel}).`);
  }
  return rel;
}

/** Mirrors `cae-guidance-preview` evaluation context layering. */
export function buildPreviewEvaluationContext(opts: {
  workspacePath: string;
  effective: Record<string, unknown>;
  commandName: string;
  moduleId?: string;
  taskId?: string;
  commandArgs?: Record<string, unknown>;
  argvSummary?: string;
  currentKitPhase: string;
}): CaeEvaluationContext {
  const commandName = opts.commandName;
  const taskId = opts.taskId?.trim()?.length ? opts.taskId.trim() : undefined;
  const moduleId = resolveBuiltinModuleId(commandName, opts.moduleId);
  const commandArgs = opts.commandArgs ?? {};
  const hydratedTask = taskId ? hydrateTaskRowForCae(opts.workspacePath, opts.effective, taskId) : null;
  const syntheticTaskRow: TaskEngineTaskRowSlice | undefined = taskId
    ? {
        id: taskId,
        status: "ready",
        phaseKey: null
      }
    : undefined;

  return buildEvaluationContext({
    taskRow: hydratedTask ?? syntheticTaskRow ?? undefined,
    command: {
      name: commandName,
      moduleId,
      args: commandArgs,
      argvSummary: opts.argvSummary
    },
    workspace: { currentKitPhase: opts.currentKitPhase },
    governance: {
      policyApprovalRequired: isSensitiveModuleCommandForEffective(commandName, commandArgs, opts.effective),
      approvalTierHint: inferApprovalTierHint(commandName, commandArgs, opts.effective)
    },
    queue: {
      readyQueueDepth: countReadyTasksInPlanningSqlite(opts.workspacePath, opts.effective),
      suggestedNextTaskId: null
    }
  });
}

const DRAFT_IMPACT_SAMPLE_CAP = 8;

function presetToBlastBucket(preset: GuidanceScopeDraft["preset"] | "unknown"): BlastRadiusScopeBucket {
  switch (preset) {
    case "always":
      return "always_global";
    case "workflow":
      return "workflow_intent";
    case "phase":
      return "phase";
    case "task":
      return "task_selector";
    case "taskTag":
      return "task_tag";
    case "completingTask":
      return "completing_task";
    case "advancedCommand":
      return "advanced_command";
    default:
      return "unknown_custom";
  }
}

function clashSeverityRank(a: ActivationReadinessV1["level"]): number {
  return a === "stop_confirm" ? 2 : a === "warning" ? 1 : 0;
}

function worstReadinessLevel(
  prev: ActivationReadinessV1["level"],
  next: ActivationReadinessV1["level"]
): ActivationReadinessV1["level"] {
  return clashSeverityRank(next) > clashSeverityRank(prev) ? next : prev;
}

function normalizePreviewSamples(
  primary: PreviewPrimaryInput,
  preset: GuidanceScopeDraft["preset"] | "unknown",
  breadthWarning: boolean,
  knownCommands: string[],
  planningTasks: ImpactPreviewPlanningTaskRow[]
): Array<
  PreviewPrimaryInput & {
    label: string;
    sampleKind: DraftImpactSampleKind;
  }
> {
  const pickAlt = (avoid: string): string => {
    const alt = knownCommands.find((c) => c !== avoid);
    return alt ?? (avoid === "list-tasks" ? "get-next-actions" : "list-tasks");
  };

  type NormRow = PreviewPrimaryInput & {
    label: string;
    sampleKind: DraftImpactSampleKind;
  };

  const mk = (partial: Partial<PreviewPrimaryInput> & { label: string; sampleKind: DraftImpactSampleKind }): NormRow => ({
    label: partial.label,
    sampleKind: partial.sampleKind,
    commandName: partial.commandName ?? primary.commandName,
    moduleId: partial.moduleId ?? primary.moduleId ?? resolveBuiltinModuleId(partial.commandName ?? primary.commandName),
    taskId: partial.taskId ?? primary.taskId,
    commandArgs: partial.commandArgs ?? primary.commandArgs ?? {},
    argvSummary: partial.argvSummary ?? primary.argvSummary
  });

  const baseLabel = primary.label?.trim()?.length ? primary.label.trim() : "Primary selection";
  const rows: NormRow[] = [];

  rows.push(
    mk({
      sampleKind: "primary",
      label: baseLabel,
      commandName: primary.commandName,
      moduleId: primary.moduleId,
      taskId: primary.taskId,
      commandArgs: primary.commandArgs,
      argvSummary: primary.argvSummary
    })
  );

  if (preset === "always" || breadthWarning) {
    const alt = pickAlt(primary.commandName);
    rows.push(
      mk({
        sampleKind: "broad_drift",
        label: "Broad-scope drift sample (alternate workflow)",
        commandName: alt,
        moduleId: resolveBuiltinModuleId(alt),
        taskId: primary.taskId
      })
    );
  }

  const alternate = pickAlt(primary.commandName);
  rows.push(
    mk({
      sampleKind: "contrast_workflow",
      label: `Contrast workflow (${alternate})`,
      commandName: alternate,
      moduleId: resolveBuiltinModuleId(alternate),
      taskId: primary.taskId
    })
  );

  if (preset === "completingTask") {
    rows.push(
      mk({
        sampleKind: "completing_task_flow",
        label: "run-transition start (no complete action)",
        commandName: "run-transition",
        moduleId: "task-engine",
        taskId: primary.taskId ?? "T921",
        commandArgs: {
          taskId: primary.taskId ?? "T921",
          action: "start"
        }
      })
    );
  }

  for (const t of planningTasks) {
    rows.push(
      mk({
        sampleKind: "planning_task",
        label: `${t.status === "in_progress" ? "In progress task" : "Ready queue task"} ${t.id}`,
        commandName: primary.commandName,
        moduleId: primary.moduleId ?? resolveBuiltinModuleId(primary.commandName),
        taskId: t.id,
        commandArgs: primary.commandArgs ?? {},
        argvSummary: primary.argvSummary
      })
    );
  }

  const seen = new Set<string>();
  const dedup: NormRow[] = [];
  for (const r of rows) {
    const key = `${r.commandName}|${r.taskId ?? ""}|${JSON.stringify(r.commandArgs ?? {})}|${r.label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    dedup.push(r);
    if (dedup.length >= DRAFT_IMPACT_SAMPLE_CAP) break;
  }
  return dedup;
}

function pickConflicts(bundle: Record<string, unknown>): Record<string, unknown>[] {
  const css = bundle.conflictShadowSummary as { entries?: unknown[] } | undefined;
  const e = css?.entries;
  return Array.isArray(e) ? (e.filter((x) => x && typeof x === "object") as Record<string, unknown>[]) : [];
}

function conflictTouchesDraft(entries: Record<string, unknown>[], draftId: string): number {
  let n = 0;
  for (const ent of entries) {
    const ids = ent["activationIds"];
    if (!Array.isArray(ids)) continue;
    const hit = ids.some((id) => String(id) === draftId);
    if (hit) n += 1;
  }
  return n;
}

function buildBlastRadiusSummary(params: {
  preset: GuidanceScopeBuildResult["preset"] | "unknown";
  samples: DraftImpactSampleRowV1[];
}): BlastRadiusSummaryV1 {
  const matched = params.samples.filter((s) => s.draftVisibleInOverlay);
  const tally: Partial<Record<DraftImpactSampleKind, number>> = {};
  for (const s of matched) {
    const k = (s.sampleKind ?? "primary") as DraftImpactSampleKind;
    tally[k] = (tally[k] ?? 0) + 1;
  }
  const rep = matched
    .map((s) => s.label)
    .filter((lbl, i, a) => a.indexOf(lbl) === i)
    .slice(0, 3);
  const planningIncluded = params.samples.filter((s) => s.sampleKind === "planning_task").length;

  return {
    schemaVersion: 1,
    draftScopeCategory: presetToBlastBucket(params.preset),
    totalSamplesEvaluated: params.samples.length,
    samplesWhereDraftMatched: matched.length,
    representativeMatchedLabels: rep,
    planningTasksIncluded: planningIncluded,
    tallyBySampleKindWhereDraftMatched: tally
  };
}

function buildActivationReadiness(params: {
  draftFamily: DraftGuidanceRuleInputV1["family"];
  scopePreset: GuidanceScopeBuildResult["preset"] | "unknown";
  breadth: { code: string; message: string }[];
  primaryOverlayBundle: Record<string, unknown>;
  primaryBaselineBundle: Record<string, unknown>;
  primaryTraceId: string;
}): ActivationReadinessV1 {
  const conflicts = pickConflicts(params.primaryOverlayBundle);
  const draftConflicts = conflictTouchesDraft(conflicts, PREVIEW_DRAFT_ACTIVATION_ID);
  let subset = conflicts.filter((c) => {
    const ids = c["activationIds"];
    return Array.isArray(ids) && ids.some((id) => String(id) === PREVIEW_DRAFT_ACTIVATION_ID);
  });
  if (subset.length > 10) subset = subset.slice(0, 10);

  const shadow = params.primaryOverlayBundle.shadowObservation as
    | {
        usefulnessSignal?: string;
      }
    | undefined;
  let usefulnessSignal: "absent" | "useful" | "noisy" =
    shadow?.usefulnessSignal === "noisy"
      ? "noisy"
      : shadow?.usefulnessSignal === "useful"
        ? "useful"
        : "absent";

  const baseAck = Array.isArray(params.primaryBaselineBundle.pendingAcknowledgements)
    ? params.primaryBaselineBundle.pendingAcknowledgements.length
    : 0;
  const overAck = Array.isArray(params.primaryOverlayBundle.pendingAcknowledgements)
    ? params.primaryOverlayBundle.pendingAcknowledgements.length
    : 0;
  const ackDelta = overAck - baseAck;

  const reasons: ActivationReadinessReasonV1[] = [];

  let level: ActivationReadinessV1["level"] = "ok";

  if (params.scopePreset === "always" && params.draftFamily === "policy") {
    reasons.push({
      code: "cae-readiness-always-policy",
      message: "Always-on rules in the policy family match every evaluation context; confirm scope is intentional before activation.",
      severity: "block"
    });
    level = worstReadinessLevel(level, "stop_confirm");
  }

  if (params.breadth.length > 0) {
    reasons.push({
      code: "cae-readiness-broad-scope",
      message: `${params.breadth.length} broad-scope Guidance warning(s); review overlap noise before activating.`,
      severity: "warn"
    });
    level = worstReadinessLevel(level, "warning");
  }

  if (conflicts.length > 0) {
    reasons.push({
      code: "cae-readiness-conflict",
      message: `${conflicts.length} same-family Guidance conflict entr${conflicts.length === 1 ? "y" : "ies"} in preview overlays (matching priorities with divergent sources).`,
      severity: conflicts.length > 2 || usefulnessSignal === "noisy" ? "warn" : "warn"
    });
    level = worstReadinessLevel(level, "warning");
  }

  if (draftConflicts > 0) {
    reasons.push({
      code: "cae-readiness-draft-in-conflict",
      message: `This draft participates in ${draftConflicts} conflict cluster(s) at the same priority tier.`,
      severity: "warn"
    });
    level = worstReadinessLevel(level, "warning");
  }

  if (usefulnessSignal === "noisy") {
    reasons.push({
      code: "cae-readiness-noisy-matrix",
      message: "Guidance usefulness signal flagged as noisy (many overlapping activations/conflicts across this draft preview matrix).",
      severity: "warn"
    });
    level = worstReadinessLevel(level, "warning");
  }

  if (ackDelta > 2) {
    reasons.push({
      code: "cae-readiness-heavy-ack",
      message: `Overlay introduces ${ackDelta} incremental acknowledgement-dependent activation(s) on the primary context vs baseline.`,
      severity: "info"
    });
  }

  if (reasons.length === 0) {
    reasons.push({
      code: "cae-readiness-clean",
      message: "No automatic blockers surfaced for activation readiness checks on the primary sampled context.",
      severity: "info"
    });
  }

  reasons.sort((a, b) => {
    const rank = (s: ActivationReadinessReasonV1["severity"]) =>
      s === "block" ? 2 : s === "warn" ? 1 : 0;
    return rank(b.severity) - rank(a.severity);
  });

  return {
    schemaVersion: 1,
    level,
    reasons,
    primaryPreviewTraceId: params.primaryTraceId,
    conflictEntryCount: conflicts.length,
    conflictsInvolvingDraft: draftConflicts,
    sameFamilyConflictSubset: subset,
    usefulnessSignal,
    overlayPendingAckCount: overAck,
    baselinePendingAckCount: baseAck,
    acknowledgementDelta: ackDelta
  };
}

function cloneConditions(conds: unknown[]): unknown[] {
  return conds.map((c) => JSON.parse(JSON.stringify(c)) as unknown);
}

/** Build overlay registry + synthesized draft activation + playbook artifact validated against CAE schemas. */
export function synthesizeDraftArtifactAndOverlay(params: {
  workspacePath: string;
  baseRegistry: CaeLoadedRegistry;
  draft: DraftGuidanceRuleInputV1;
  knownWorkflowNames: string[];
}): { ok: false; code: string; message: string; scopeBuild?: GuidanceScopeBuildResult } | { ok: true; overlay: CaeLoadedRegistry; scopeBuild: GuidanceScopeBuildResult } {
  const scopeBuild = buildGuidanceScopeDraft(params.draft.scopeDraft, {
    knownWorkflowNames: params.knownWorkflowNames
  });
  if (!scopeBuild.ok || !scopeBuild.scope?.conditions?.length) {
    const msg =
      scopeBuild.errors.map((e) => e.message).join("; ").trim() || "Invalid Guidance scope draft for impact preview";
    return { ok: false, code: "cae-draft-scope-invalid", message: msg, scopeBuild };
  }

  let refRel: string;
  try {
    refRel = assertRepoRelativeRef(params.workspacePath, params.draft.refPath?.trim() || DEFAULT_PREVIEW_DRAFT_REF);
  } catch (err) {
    const m = err instanceof Error ? err.message : String(err);
    const code = m.startsWith("cae-draft") ? m.split(":")[0]!.trim() ?? "cae-draft-invalid" : "cae-draft-invalid";
    return { ok: false, code, message: m, scopeBuild };
  }

  const title =
    typeof params.draft.title === "string" && params.draft.title.trim().length > 0
      ? params.draft.title.trim()
      : "Draft Guidance source";

  const artifactRow: Record<string, unknown> = {
    schemaVersion: 1,
    artifactId: PREVIEW_DRAFT_ARTIFACT_ID,
    artifactType: params.draft.artifactType ?? "playbook",
    ref: { path: refRel },
    title
  };

  const vArt = validateSingleCaeArtifactRecord(artifactRow);
  if (!vArt.ok) return { ok: false, code: vArt.code, message: vArt.message, scopeBuild };

  const conditionsClone = cloneConditions(scopeBuild.scope!.conditions);

  const ack =
    params.draft.acknowledgement ??
    ({
      strength: "surface",
      token: "cae.preview.draft.note"
    } as const);

  const activationRow: Record<string, unknown> = {
    schemaVersion: 1,
    activationId: PREVIEW_DRAFT_ACTIVATION_ID,
    family: params.draft.family,
    lifecycleState: "active",
    priority: Math.min(9999, Math.max(0, Math.floor(Number(params.draft.priority ?? 500)))),
    scope: { conditions: conditionsClone },
    artifactRefs: [{ artifactId: PREVIEW_DRAFT_ARTIFACT_ID }],
    acknowledgement: ack
  };

  const vAct = validateSingleCaeActivationRecord(activationRow);
  if (!vAct.ok) return { ok: false, code: vAct.code, message: vAct.message, scopeBuild };

  const breadth = collectBroadScopeWarnings(scopeBuild);
  const digestFoot = `${scopeBuild.preset}:${breadth.length ? "b" : "n"}`;
  const appended = appendValidatedCaeRegistryOverlay(
    params.baseRegistry,
    [vArt.value],
    [vAct.value],
    digestFoot
  );
  if (!appended.ok) return { ok: false, code: appended.code, message: appended.message, scopeBuild };
  return { ok: true, overlay: appended.value, scopeBuild };
}

export function buildGuidanceDraftImpactMatrix(params: {
  workspacePath: string;
  effective: Record<string, unknown>;
  baseRegistry: CaeLoadedRegistry;
  overlayRegistry: CaeLoadedRegistry;
  scopeBuild: GuidanceScopeBuildResult;
  draftFamily: DraftGuidanceRuleInputV1["family"];
  primary: PreviewPrimaryInput;
  currentKitPhase: string;
  evalMode: CaeEvaluateMode;
}): GuidanceDraftImpactV1 {
  const knownCmds = BUILTIN_RUN_COMMAND_MANIFEST.map((r) => r.name);
  const breadth = collectBroadScopeWarnings(params.scopeBuild);
  const breadthFlag = breadth.length > 0;
  const preset = params.scopeBuild.preset;

  const planningFetched = listImpactPreviewPlanningTasks(params.workspacePath, params.effective, {
    currentPhaseKey: params.currentKitPhase.trim() !== "" ? params.currentKitPhase.trim() : undefined,
    limit: DRAFT_IMPACT_SAMPLE_CAP + 4
  });

  const normalized = normalizePreviewSamples(
    params.primary,
    preset === "unknown" ? "unknown" : preset,
    breadthFlag || preset === "always",
    knownCmds,
    planningFetched
  );

  const rows: DraftImpactSampleRowV1[] = [];
  const mode = params.evalMode === "live" ? "live" : "shadow";
  let primaryOverlayBundle: Record<string, unknown> | null = null;
  let primaryBaselineBundle: Record<string, unknown> | null = null;
  let primaryTraceId = "";

  for (let i = 0; i < normalized.length; i++) {
    const s = normalized[i]!;
    const ec = buildPreviewEvaluationContext({
      workspacePath: params.workspacePath,
      effective: params.effective,
      commandName: s.commandName,
      moduleId: s.moduleId,
      taskId: s.taskId,
      commandArgs: s.commandArgs,
      argvSummary: s.argvSummary,
      currentKitPhase: params.currentKitPhase
    });

    const baseline = evaluateActivationBundle(ec, params.baseRegistry, { evalMode: mode });
    const overlaid = evaluateActivationBundle(ec, params.overlayRegistry, { evalMode: mode });

    if (i === 0) {
      primaryOverlayBundle = overlaid.bundle as Record<string, unknown>;
      primaryBaselineBundle = baseline.bundle as Record<string, unknown>;
      primaryTraceId = overlaid.traceId;
    }

    rows.push({
      schemaVersion: 1,
      label: s.label,
      sampleKind: s.sampleKind,
      commandName: s.commandName,
      taskId: s.taskId,
      baselineFamilyCounts: familyCountsFromBundle(baseline.bundle as Record<string, unknown>),
      overlayFamilyCounts: familyCountsFromBundle(overlaid.bundle as Record<string, unknown>),
      draftVisibleInOverlay: overlayBundleShowsDraft(overlaid.bundle as Record<string, unknown>)
    });
  }

  const safeOverlay = primaryOverlayBundle ?? {};
  const safeBaseline = primaryBaselineBundle ?? {};
  const blastRadiusSummary = buildBlastRadiusSummary({
    preset: params.scopeBuild.preset,
    samples: rows
  });
  const activationReadiness = buildActivationReadiness({
    draftFamily: params.draftFamily,
    scopePreset: params.scopeBuild.preset,
    breadth,
    primaryOverlayBundle: safeOverlay,
    primaryBaselineBundle: safeBaseline,
    primaryTraceId: primaryTraceId || String((safeOverlay as Record<string, unknown>).traceId ?? "")
  });

  return {
    schemaVersion: 1,
    draftArtifactId: PREVIEW_DRAFT_ARTIFACT_ID,
    draftActivationId: PREVIEW_DRAFT_ACTIVATION_ID,
    scopePreset: params.scopeBuild.preset,
    scopePlainSummary: params.scopeBuild.summary,
    overlayRegistryDigestSnippet: params.overlayRegistry.registryDigest.slice(0, 40),
    scopeWarnings: params.scopeBuild.warnings,
    scopeErrors: params.scopeBuild.errors,
    broadScopeWarnings: breadth,
    primarySampleLabel: normalized[0]?.label ?? "Primary selection",
    samples: rows,
    blastRadiusSummary,
    activationReadiness
  };
}

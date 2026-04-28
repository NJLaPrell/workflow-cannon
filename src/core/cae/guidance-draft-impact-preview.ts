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
import { countReadyTasksInPlanningSqlite } from "./cae-queue-snapshot.js";
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

export type DraftImpactSampleRowV1 = {
  schemaVersion: 1;
  label: string;
  commandName: string;
  taskId?: string;
  baselineFamilyCounts: { policy: number; think: number; do: number; review: number };
  overlayFamilyCounts: { policy: number; think: number; do: number; review: number };
  draftVisibleInOverlay: boolean;
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

function cloneConditions(conds: unknown[]): unknown[] {
  return conds.map((c) => JSON.parse(JSON.stringify(c)) as unknown);
}

function normalizePreviewSamples(
  primary: PreviewPrimaryInput,
  preset: GuidanceScopeDraft["preset"] | "unknown",
  breadthWarning: boolean,
  knownCommands: string[]
): Array<PreviewPrimaryInput & { label: string }> {
  const pickAlt = (avoid: string): string => {
    const alt = knownCommands.find((c) => c !== avoid);
    return alt ?? (avoid === "list-tasks" ? "get-next-actions" : "list-tasks");
  };

  const mk = (
    partial: Partial<PreviewPrimaryInput> & { label: string }
  ): PreviewPrimaryInput & { label: string } => ({
    label: partial.label,
    commandName: partial.commandName ?? primary.commandName,
    moduleId: partial.moduleId ?? primary.moduleId ?? resolveBuiltinModuleId(partial.commandName ?? primary.commandName),
    taskId: partial.taskId ?? primary.taskId,
    commandArgs: partial.commandArgs ?? primary.commandArgs ?? {},
    argvSummary: partial.argvSummary ?? primary.argvSummary
  });

  const baseLabel = primary.label?.trim()?.length ? primary.label.trim() : "Primary selection";
  const rows: Array<PreviewPrimaryInput & { label: string }> = [];

  rows.push(
    mk({
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
      label: `Contrast workflow (${alternate})`,
      commandName: alternate,
      moduleId: resolveBuiltinModuleId(alternate),
      taskId: primary.taskId
    })
  );

  if (preset === "completingTask") {
    rows.push(
      mk({
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

  const seen = new Set<string>();
  const dedup: typeof rows = [];
  for (const r of rows) {
    const key = `${r.commandName}|${r.taskId ?? ""}|${JSON.stringify(r.commandArgs ?? {})}`;
    if (seen.has(key)) continue;
    seen.add(key);
    dedup.push(r);
    if (dedup.length >= 6) break;
  }
  return dedup;
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
  primary: PreviewPrimaryInput;
  currentKitPhase: string;
  evalMode: CaeEvaluateMode;
}): GuidanceDraftImpactV1 {
  const knownCmds = BUILTIN_RUN_COMMAND_MANIFEST.map((r) => r.name);
  const breadth = collectBroadScopeWarnings(params.scopeBuild);
  const breadthFlag = breadth.length > 0;
  const preset = params.scopeBuild.preset;
  const normalized = normalizePreviewSamples(
    params.primary,
    preset === "unknown" ? "unknown" : preset,
    breadthFlag || preset === "always",
    knownCmds
  );

  const rows: DraftImpactSampleRowV1[] = [];
  const mode = params.evalMode === "live" ? "live" : "shadow";

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

    rows.push({
      schemaVersion: 1,
      label: s.label,
      commandName: s.commandName,
      taskId: s.taskId,
      baselineFamilyCounts: familyCountsFromBundle(baseline.bundle as Record<string, unknown>),
      overlayFamilyCounts: familyCountsFromBundle(overlaid.bundle as Record<string, unknown>),
      draftVisibleInOverlay: overlayBundleShowsDraft(overlaid.bundle as Record<string, unknown>)
    });
  }

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
    samples: rows
  };
}

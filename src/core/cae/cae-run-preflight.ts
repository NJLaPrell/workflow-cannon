import type { ModuleCommandResult } from "../../contracts/module-contract.js";
import type { ModuleCommandRouter } from "../module-command-router.js";
import {
  getPolicySensitivityForBuiltinCommand,
  isSensitiveModuleCommandForEffective
} from "../policy.js";
import { getAtPath } from "../workspace-kit-config.js";
import { evaluateActivationBundle } from "./cae-evaluate.js";
import { findCaeEnforcementBlock } from "./cae-enforcement-allowlist.js";
import { openKitSqliteReadWrite } from "./cae-kit-sqlite.js";
import { countReadyTasksInPlanningSqlite } from "./cae-queue-snapshot.js";
import { buildEvaluationContext } from "./evaluation-context-builder.js";
import type { TaskEngineTaskRowSlice } from "./evaluation-context-builder.js";
import type { CaeEvaluationContext } from "./evaluation-context-types.js";
import { loadCaeRegistryForKit } from "./cae-registry-effective.js";

export type CaeCliPreflightOutcome = {
  shadowAttach: Record<string, unknown> | null;
  enforcementDenial: ModuleCommandResult | null;
  traceToStore: { traceId: string; bundle: Record<string, unknown>; trace: Record<string, unknown> } | null;
};

function pickTaskIdFromCommandArgs(args: Record<string, unknown>): string | undefined {
  const raw = args.taskId ?? args.id;
  if (typeof raw !== "string") return undefined;
  const tid = raw.trim();
  if (/^T[0-9]{3,}$/.test(tid)) return tid;
  return undefined;
}

const CAE_TASK_METADATA_ALLOWLIST = new Set([
  "specPath",
  "caePhase",
  "phaseProgram",
  "programContextPath",
  "risk"
]);

function pickCaeTaskMetadata(raw: string | null, risk: string | null): Record<string, unknown> | null {
  const out: Record<string, unknown> = {};
  if (risk === "low" || risk === "medium" || risk === "high") {
    out.risk = risk;
  }
  if (!raw) return Object.keys(out).length ? out : null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return Object.keys(out).length ? out : null;
    }
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!CAE_TASK_METADATA_ALLOWLIST.has(key)) continue;
      if (key === "risk") {
        if (value === "low" || value === "medium" || value === "high") out.risk = value;
        continue;
      }
      if (typeof value === "string") out[key] = value;
    }
  } catch {
    return Object.keys(out).length ? out : null;
  }
  return Object.keys(out).length ? out : null;
}

function parseFeatureJson(raw: string | null): string[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    const features = parsed.filter((x): x is string => typeof x === "string");
    return features.length ? features : null;
  } catch {
    return null;
  }
}

function hydrateTaskRowForCae(
  workspacePath: string,
  effective: Record<string, unknown>,
  taskId: string
): TaskEngineTaskRowSlice | null {
  const db = openKitSqliteReadWrite(workspacePath, effective);
  if (!db) return null;
  try {
    const row = db
      .prepare(
        `SELECT id, status, title, phase_key, metadata_json, risk, features_json
         FROM task_engine_tasks
         WHERE id = ? AND archived = 0`
      )
      .get(taskId) as
      | {
          id: string;
          status: string;
          title: string;
          phase_key: string | null;
          metadata_json: string | null;
          risk: string | null;
          features_json: string | null;
        }
      | undefined;
    if (!row) return null;
    let features: string[] | null = null;
    try {
      const linkRows = db
        .prepare(`SELECT feature_id FROM task_engine_task_features WHERE task_id = ? ORDER BY feature_id ASC`)
        .all(taskId) as { feature_id: string }[];
      features = linkRows.length ? linkRows.map((r) => r.feature_id) : null;
    } catch {
      features = null;
    }
    const finalFeatures = features ?? parseFeatureJson(row.features_json);
    return {
      id: row.id,
      status: row.status,
      title: row.title,
      phaseKey: row.phase_key,
      tags: finalFeatures ?? undefined,
      features: finalFeatures,
      metadata: pickCaeTaskMetadata(row.metadata_json, row.risk)
    };
  } catch {
    return null;
  } finally {
    db.close();
  }
}

function inferApprovalTierHint(
  subcommand: string,
  commandArgs: Record<string, unknown>,
  effective: Record<string, unknown>
): "none" | "A" | "B" | "C" {
  if (!isSensitiveModuleCommandForEffective(subcommand, commandArgs, effective)) return "C";
  const sens = getPolicySensitivityForBuiltinCommand(subcommand);
  if (sens === "sensitive-with-dryrun") return "B";
  return "A";
}

function buildEvaluationContextForRun(
  workspacePath: string,
  effective: Record<string, unknown>,
  subcommand: string,
  commandArgs: Record<string, unknown>,
  router: ModuleCommandRouter
): CaeEvaluationContext {
  const modId = router.describeCommand(subcommand)?.moduleId;
  const tid = pickTaskIdFromCommandArgs(commandArgs);
  const phase = String(getAtPath(effective, "kit.currentPhaseNumber") ?? "0");
  const hydratedTask = tid ? hydrateTaskRowForCae(workspacePath, effective, tid) : null;
  return buildEvaluationContext({
    taskRow: hydratedTask ?? (tid ? { id: tid, status: "ready", phaseKey: null } : null),
    command: { name: subcommand, moduleId: modId ?? undefined, args: commandArgs },
    workspace: { currentKitPhase: phase },
    governance: {
      policyApprovalRequired: isSensitiveModuleCommandForEffective(subcommand, commandArgs, effective),
      approvalTierHint: inferApprovalTierHint(subcommand, commandArgs, effective)
    },
    queue: {
      readyQueueDepth: countReadyTasksInPlanningSqlite(workspacePath, effective),
      suggestedNextTaskId: null
    }
  });
}

function shouldSkipCaeForSubcommand(subcommand: string): boolean {
  return subcommand.startsWith("cae-");
}

/**
 * Shadow preflight + optional enforcement probe for `handleRunCommand` (**`T864`**, **`T866`**).
 * Degrades on errors — never blocks except explicit enforcement allowlist match.
 */
export function runCaeCliPreflight(input: {
  workspacePath: string;
  effective: Record<string, unknown>;
  subcommand: string;
  commandArgs: Record<string, unknown>;
  router: ModuleCommandRouter;
}): CaeCliPreflightOutcome {
  const empty: CaeCliPreflightOutcome = {
    shadowAttach: null,
    enforcementDenial: null,
    traceToStore: null
  };

  const caeEnabled = getAtPath(input.effective, "kit.cae.enabled") === true;
  const envShadow = process.env.WORKSPACE_KIT_CAE_SHADOW === "1";
  if (!caeEnabled) {
    return empty;
  }

  if (shouldSkipCaeForSubcommand(input.subcommand)) {
    return empty;
  }

  const wantShadow =
    getAtPath(input.effective, "kit.cae.runtime.shadowPreflight") === true || envShadow;
  const wantEnforce = getAtPath(input.effective, "kit.cae.enforcement.enabled") === true;

  if (!wantShadow && !wantEnforce) {
    return empty;
  }

  try {
    const ctx = buildEvaluationContextForRun(
      input.workspacePath,
      input.effective,
      input.subcommand,
      input.commandArgs,
      input.router
    );
    const reg = loadCaeRegistryForKit(input.workspacePath, input.effective);
    if (!reg.ok) {
      const degraded: Record<string, unknown> = {
        schemaVersion: 1,
        evalMode: "shadow",
        degraded: true,
        issues: [{ code: reg.code, detail: reg.message ?? "" }]
      };
      return {
        shadowAttach: wantShadow ? degraded : null,
        enforcementDenial: null,
        traceToStore: null
      };
    }

    let traceToStore: CaeCliPreflightOutcome["traceToStore"] = null;

    if (wantShadow) {
      const { bundle, trace, traceId } = evaluateActivationBundle(ctx, reg.value, {
        evalMode: "shadow"
      });
      traceToStore = { traceId, bundle, trace };
      const fam = bundle.families as Record<string, unknown[]> | undefined;
      const count = (k: string) => (Array.isArray(fam?.[k]) ? fam[k].length : 0);
      const shadowEntries = (bundle.shadowObservation as { wouldActivate?: unknown[] } | undefined)
        ?.wouldActivate;
      const shadowAttach: Record<string, unknown> = {
        schemaVersion: 1,
        evalMode: "shadow",
        traceId,
        shadow: true,
        summary: {
          policyCount: count("policy"),
          thinkCount: count("think"),
          doCount: count("do"),
          reviewCount: count("review"),
          shadowObservationCount: Array.isArray(shadowEntries) ? shadowEntries.length : 0
        }
      };
      return finalizeEnforce(
        input,
        ctx,
        reg.value,
        wantEnforce,
        wantShadow ? shadowAttach : null,
        traceToStore
      );
    }

    return finalizeEnforce(input, ctx, reg.value, wantEnforce, null, null);
  } catch {
    const degraded: Record<string, unknown> = {
      schemaVersion: 1,
      evalMode: "shadow",
      degraded: true,
      issues: [{ code: "cae-evaluator-internal-error", detail: "preflight threw" }]
    };
    return {
      shadowAttach: wantShadow ? degraded : null,
      enforcementDenial: null,
      traceToStore: null
    };
  }
}

function finalizeEnforce(
  input: {
    workspacePath: string;
    subcommand: string;
  },
  ctx: CaeEvaluationContext,
  reg: import("./cae-registry-load.js").CaeLoadedRegistry,
  wantEnforce: boolean,
  shadowAttach: Record<string, unknown> | null,
  traceToStore: CaeCliPreflightOutcome["traceToStore"]
): CaeCliPreflightOutcome {
  if (!wantEnforce) {
    return { shadowAttach, enforcementDenial: null, traceToStore };
  }
  const { bundle } = evaluateActivationBundle(ctx, reg, { evalMode: "live" });
  const block = findCaeEnforcementBlock(input.subcommand, bundle);
  if (!block) {
    return { shadowAttach, enforcementDenial: null, traceToStore };
  }
  return {
    shadowAttach,
    enforcementDenial: {
      ok: false,
      code: "cae-enforcement-blocked",
      message: `CAE enforcement allowlist matched: ${block.id}`,
      remediation: { docPath: ".ai/cae/enforcement-lane.md" }
    },
    traceToStore
  };
}

export function mergeCaeIntoCommandResult(
  result: ModuleCommandResult,
  cae: Record<string, unknown> | null
): ModuleCommandResult {
  if (!cae) return result;
  const existing =
    result.data && typeof result.data === "object" && !Array.isArray(result.data)
      ? { ...(result.data as Record<string, unknown>) }
      : {};
  return {
    ...result,
    data: {
      ...existing,
      cae
    }
  };
}

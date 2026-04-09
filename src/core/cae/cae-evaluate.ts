/**
 * Deterministic CAE evaluation (T860) — v1 scope matching + per-family ordering.
 * Precedence merge / shadow ties: future hardening; empty conflict summary when no collisions.
 */

import { createHash } from "node:crypto";

import type { CaeEvaluationContext } from "./evaluation-context-types.js";
import { canonicalizeEvaluationContextForHash } from "./evaluation-context-builder.js";
import type { CaeLoadedRegistry, CaeRegistryActivationRow } from "./cae-registry-load.js";

export type CaeEvaluateMode = "live" | "shadow";

export type CaeEvaluateOptions = {
  evalMode?: CaeEvaluateMode;
};

type Family = "policy" | "think" | "do" | "review";

const AGG_TIGHTNESS: Record<Family, number> = {
  policy: 4,
  think: 6,
  do: 5,
  review: 7
};

function shortDigest(parts: string[]): string {
  const h = createHash("sha256").update(parts.join("|")).digest("hex");
  return h.slice(0, 40);
}

function asFamily(v: unknown): Family | null {
  if (v === "policy" || v === "think" || v === "do" || v === "review") return v;
  return null;
}

function matchCondition(ctx: CaeEvaluationContext, cond: Record<string, unknown>): boolean {
  const kind = cond.kind;
  if (kind === "always") return true;
  if (kind === "phaseKey" && typeof cond.value === "string") {
    return ctx.task.phaseKey === cond.value;
  }
  if (kind === "commandName") {
    const m = cond.match;
    const v = typeof cond.value === "string" ? cond.value : "";
    const name = ctx.command.name ?? "";
    if (m === "exact") return name === v;
    if (m === "prefix") return v.length > 0 && name.startsWith(v);
    return false;
  }
  if (kind === "taskTag") {
    const values = cond.values;
    const match = cond.match === "all" ? "all" : "any";
    if (!Array.isArray(values) || values.length === 0) return false;
    const tags = new Set(ctx.task.tags ?? []);
    if (match === "all") {
      return values.every((t) => typeof t === "string" && tags.has(t));
    }
    return values.some((t) => typeof t === "string" && tags.has(t));
  }
  if (kind === "taskIdPattern" && typeof cond.pattern === "string") {
    try {
      const re = new RegExp(cond.pattern);
      return re.test(ctx.task.taskId);
    } catch {
      return false;
    }
  }
  return false;
}

function activationMatches(ctx: CaeEvaluationContext, act: CaeRegistryActivationRow): boolean {
  const state = act.lifecycleState;
  if (state !== "active") return false;
  const scope = act.scope as { conditions?: unknown[] } | undefined;
  const conds = scope?.conditions;
  if (!Array.isArray(conds) || conds.length === 0) return false;
  for (const c of conds) {
    if (!c || typeof c !== "object" || Array.isArray(c)) return false;
    if (!matchCondition(ctx, c as Record<string, unknown>)) return false;
  }
  return true;
}

function artifactIdsFromActivation(act: CaeRegistryActivationRow): string[] {
  const refs = act.artifactRefs as Array<{ artifactId?: string }> | undefined;
  if (!refs?.length) return [];
  return refs.map((r) => r.artifactId).filter((id): id is string => typeof id === "string" && id.length > 0);
}

/**
 * Evaluate registry activations against a v1 evaluation context.
 */
export function evaluateActivationBundle(
  context: CaeEvaluationContext,
  reg: CaeLoadedRegistry,
  options?: CaeEvaluateOptions
): {
  bundle: Record<string, unknown>;
  trace: Record<string, unknown>;
  traceId: string;
} {
  const evalMode: CaeEvaluateMode = options?.evalMode === "shadow" ? "shadow" : "live";
  const byFamily: Record<Family, CaeRegistryActivationRow[]> = {
    policy: [],
    think: [],
    do: [],
    review: []
  };

  for (const act of reg.activations) {
    if (!activationMatches(context, act)) continue;
    const fam = asFamily(act.family);
    if (!fam) continue;
    byFamily[fam].push(act);
  }

  const sortActs = (acts: CaeRegistryActivationRow[]) =>
    [...acts].sort((a, b) => {
      const pa = Number(a.priority) || 0;
      const pb = Number(b.priority) || 0;
      if (pb !== pa) return pb - pa;
      const ida = String(a.activationId ?? "");
      const idb = String(b.activationId ?? "");
      return ida.localeCompare(idb);
    });

  const familiesOut: Record<Family, Record<string, unknown>[]> = {
    policy: [],
    think: [],
    do: [],
    review: []
  };

  for (const fam of ["policy", "think", "do", "review"] as Family[]) {
    for (const act of sortActs(byFamily[fam])) {
      const aids = artifactIdsFromActivation(act);
      if (aids.length === 0) continue;
      familiesOut[fam].push({
        activationId: act.activationId,
        family: fam,
        priority: act.priority,
        aggregateTightness: AGG_TIGHTNESS[fam],
        artifactIds: aids
      });
    }
  }

  const ctxCanon = canonicalizeEvaluationContextForHash(context);
  const bundleId = `cae.bundle.${shortDigest([ctxCanon, reg.registryDigest])}`;
  const traceId = `cae.trace.${shortDigest([bundleId, "trace", evalMode])}`;

  const bundle: Record<string, unknown> = {
    schemaVersion: 1,
    bundleId,
    families: {
      policy: familiesOut.policy,
      think: familiesOut.think,
      do: familiesOut.do,
      review: familiesOut.review
    },
    pendingAcknowledgements: [],
    conflictShadowSummary: {
      evalMode,
      entries: []
    },
    traceId,
    explanationRef: `explain:${traceId.slice(-24)}`
  };

  if (evalMode === "shadow") {
    bundle.evaluationPipelineMode = "shadow";
  }

  const famCounts = {
    policy: familiesOut.policy.length,
    think: familiesOut.think.length,
    do: familiesOut.do.length,
    review: familiesOut.review.length
  };

  const trace: Record<string, unknown> = {
    schemaVersion: 1,
    traceId,
    bundleId,
    anchors: {
      evaluationContextContentHash: shortDigest([ctxCanon]),
      registryContentHash: reg.registryDigest.slice(0, 64)
    },
    events: [
      {
        seq: 0,
        eventType: "cae.trace.eval.summary",
        payload: {
          evalMode,
          familyCounts: famCounts,
          candidateCount: reg.activations.length
        }
      }
    ]
  };

  return { bundle, trace, traceId };
}

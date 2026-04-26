/**
 * Deterministic CAE evaluation — scope match, layered task/command merge, conflicts, acks, shadow hints.
 */

import { createHash } from "node:crypto";

import type { CaeEvaluationContext } from "./evaluation-context-types.js";
import {
  CAE_GLOBAL_TASK_ID,
  canonicalizeEvaluationContextForHash
} from "./evaluation-context-builder.js";
import type { CaeLoadedRegistry, CaeRegistryActivationRow } from "./cae-registry-load.js";
import { findCaeEnforcementBlock } from "./cae-enforcement-allowlist.js";

export type CaeEvaluateMode = "live" | "shadow";

export type CaeEvaluateOptions = {
  evalMode?: CaeEvaluateMode;
  /** When false, skip task/command layered merge (single pass on `context`). */
  layered?: boolean;
};

type Family = "policy" | "think" | "do" | "review";

const AGG_TIGHTNESS: Record<Family, number> = {
  policy: 4,
  think: 6,
  do: 5,
  review: 7
};

const TASK_LAYER_COMMAND = "__cae_task_layer__";

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

function sortActs(acts: CaeRegistryActivationRow[]): CaeRegistryActivationRow[] {
  return [...acts].sort((a, b) => {
    const pa = Number(a.priority) || 0;
    const pb = Number(b.priority) || 0;
    if (pb !== pa) return pb - pa;
    const ida = String(a.activationId ?? "");
    const idb = String(b.activationId ?? "");
    return ida.localeCompare(idb);
  });
}

function collectByFamily(
  context: CaeEvaluationContext,
  reg: CaeLoadedRegistry
): Record<Family, CaeRegistryActivationRow[]> {
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
  return byFamily;
}

function rowsFromActs(acts: CaeRegistryActivationRow[], fam: Family): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const act of sortActs(acts)) {
    const aids = artifactIdsFromActivation(act);
    if (aids.length === 0) continue;
    out.push({
      activationId: act.activationId,
      family: fam,
      priority: act.priority,
      aggregateTightness: AGG_TIGHTNESS[fam],
      artifactIds: aids
    });
  }
  return out;
}

function mergeLayeredFamilies(
  taskByFam: Record<Family, CaeRegistryActivationRow[]>,
  cmdByFam: Record<Family, CaeRegistryActivationRow[]>
): Record<Family, Record<string, unknown>[]> {
  const out: Record<Family, Record<string, unknown>[]> = {
    policy: [],
    think: [],
    do: [],
    review: []
  };
  for (const fam of ["policy", "think", "do", "review"] as Family[]) {
    const taskRows = rowsFromActs(taskByFam[fam], fam);
    const cmdRows = rowsFromActs(cmdByFam[fam], fam);
    const byId = new Map<string, Record<string, unknown>>();
    for (const r of taskRows) {
      byId.set(String(r.activationId), r);
    }
    for (const r of cmdRows) {
      const id = String(r.activationId);
      const prev = byId.get(id);
      if (!prev) {
        byId.set(id, r);
        continue;
      }
      const pp = Number(prev.priority) || 0;
      const cp = Number(r.priority) || 0;
      if (cp > pp) {
        byId.set(id, r);
      }
    }
    const merged = [...byId.values()].sort((a, b) => {
      const p = Number(b.priority) - Number(a.priority);
      if (p !== 0) return p;
      return String(a.activationId).localeCompare(String(b.activationId));
    });
    out[fam] = merged;
  }
  return out;
}

function singlePassFamilies(
  byFamily: Record<Family, CaeRegistryActivationRow[]>
): Record<Family, Record<string, unknown>[]> {
  const out: Record<Family, Record<string, unknown>[]> = {
    policy: [],
    think: [],
    do: [],
    review: []
  };
  for (const fam of ["policy", "think", "do", "review"] as Family[]) {
    out[fam] = rowsFromActs(byFamily[fam], fam);
  }
  return out;
}

function artifactSetKey(ids: string[]): string {
  return [...ids].sort((a, b) => a.localeCompare(b)).join("|");
}

function detectSameFamilyConflicts(
  byFamily: Record<Family, CaeRegistryActivationRow[]>
): Record<string, unknown>[] {
  const entries: Record<string, unknown>[] = [];
  for (const fam of ["policy", "think", "do", "review"] as Family[]) {
    const acts = sortActs(byFamily[fam]);
    const byPri = new Map<number, CaeRegistryActivationRow[]>();
    for (const a of acts) {
      const p = Number(a.priority) || 0;
      const g = byPri.get(p) ?? [];
      g.push(a);
      byPri.set(p, g);
    }
    for (const [_pri, group] of byPri) {
      if (group.length < 2) continue;
      const keys = new Set(group.map((g) => artifactSetKey(artifactIdsFromActivation(g))));
      if (keys.size <= 1) continue;
      entries.push({
        kind: "same_family_tie",
        activationIds: group.map((g) => String(g.activationId)),
        resolution: "shadow",
        detail: `divergent artifacts same priority in ${fam}`
      });
    }
  }
  return entries;
}

function stripAdvisoryWhenPolicyClaimsArtifact(familiesOut: Record<Family, Record<string, unknown>[]>): void {
  const policyArts = new Set<string>();
  for (const row of familiesOut.policy) {
    for (const id of (row.artifactIds as string[]) ?? []) policyArts.add(id);
  }
  for (const fam of ["think", "do", "review"] as Family[]) {
    familiesOut[fam] = familiesOut[fam].filter((row) => {
      const aids = (row.artifactIds as string[]) ?? [];
      return !aids.some((a) => policyArts.has(a));
    });
  }
}

type AckStrength = "none" | "surface" | "recommend" | "ack_required" | "satisfy_required";

function readAckStrength(act: CaeRegistryActivationRow): AckStrength | null {
  const ack = act.acknowledgement as { strength?: string } | undefined;
  const s = ack?.strength;
  if (
    s === "none" ||
    s === "surface" ||
    s === "recommend" ||
    s === "ack_required" ||
    s === "satisfy_required"
  ) {
    return s;
  }
  return null;
}

function buildPendingAcknowledgements(
  byFamily: Record<Family, CaeRegistryActivationRow[]>,
  mergedActs: Set<string>
): Record<string, unknown>[] {
  const pending: Record<string, unknown>[] = [];
  for (const fam of ["policy", "think", "do", "review"] as Family[]) {
    for (const act of byFamily[fam]) {
      if (!mergedActs.has(String(act.activationId))) continue;
      const st = readAckStrength(act);
      if (!st || st === "none") continue;
      const ack = act.acknowledgement as { token?: string };
      const token = typeof ack?.token === "string" ? ack.token : act.activationId;
      pending.push({
        activationId: act.activationId,
        strength: st,
        ackToken: token
      });
    }
  }
  return pending;
}

function mergedActivationIds(familiesOut: Record<Family, Record<string, unknown>[]>): Set<string> {
  const s = new Set<string>();
  for (const fam of ["policy", "think", "do", "review"] as Family[]) {
    for (const row of familiesOut[fam]) {
      s.add(String(row.activationId));
    }
  }
  return s;
}

function buildTaskLayerContext(ctx: CaeEvaluationContext): CaeEvaluationContext {
  return {
    ...ctx,
    command: {
      name: TASK_LAYER_COMMAND,
      moduleId: "context-activation"
    }
  };
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
  const layered = options?.layered !== false && context.task.taskId !== CAE_GLOBAL_TASK_ID;

  let familiesOut: Record<Family, Record<string, unknown>[]>;
  let unionByFamily: Record<Family, CaeRegistryActivationRow[]>;

  if (layered) {
    const taskCtx = buildTaskLayerContext(context);
    const taskFam = collectByFamily(taskCtx, reg);
    const cmdFam = collectByFamily(context, reg);
    unionByFamily = { policy: [], think: [], do: [], review: [] };
    for (const fam of ["policy", "think", "do", "review"] as Family[]) {
      const m = new Map<string, CaeRegistryActivationRow>();
      for (const a of [...taskFam[fam], ...cmdFam[fam]]) {
        m.set(String(a.activationId), a);
      }
      unionByFamily[fam] = [...m.values()];
    }
    familiesOut = mergeLayeredFamilies(taskFam, cmdFam);
  } else {
    unionByFamily = collectByFamily(context, reg);
    familiesOut = singlePassFamilies(unionByFamily);
  }

  stripAdvisoryWhenPolicyClaimsArtifact(familiesOut);

  const conflictEntries = detectSameFamilyConflicts(unionByFamily);
  const mergedIds = mergedActivationIds(familiesOut);
  const pendingAcknowledgements = buildPendingAcknowledgements(unionByFamily, mergedIds);

  const ctxCanon = canonicalizeEvaluationContextForHash(context);
  const bundleId = `cae.bundle.${shortDigest([ctxCanon, reg.registryDigest, layered ? "L1" : "L0"])}`;
  const traceId = `cae.trace.${shortDigest([bundleId, "trace", evalMode])}`;

  const bundle: Record<string, unknown> = {
    schemaVersion: 1,
    bundleId,
    evaluationPipelineMode: evalMode,
    families: {
      policy: familiesOut.policy,
      think: familiesOut.think,
      do: familiesOut.do,
      review: familiesOut.review
    },
    pendingAcknowledgements,
    conflictShadowSummary: {
      evalMode,
      entries: conflictEntries
    },
    traceId,
    explanationRef: `explain:${traceId.slice(-24)}`
  };

  const cmdName = context.command.name ?? "";
  const block = findCaeEnforcementBlock(cmdName, bundle);

  if (evalMode === "shadow") {
    const wouldActivate: Record<string, unknown>[] = [];
    for (const fam of ["policy", "think", "do", "review"] as Family[]) {
      for (const act of sortActs(unionByFamily[fam])) {
        wouldActivate.push({
          activationId: act.activationId,
          family: fam,
          artifactIds: artifactIdsFromActivation(act)
        });
      }
    }
    const wouldRequireAck = pendingAcknowledgements.map((p) => ({
      activationId: p.activationId,
      strength: p.strength,
      ackToken: p.ackToken
    }));
    const wouldEnforce: Record<string, unknown>[] = [];
    if (block) {
      wouldEnforce.push({
        activationId: "cae.enforcement.pilot",
        lane: "enforcement" as const,
        commandName: cmdName
      });
    }
    let usefulnessSignal: "absent" | "useful" | "noisy" = "absent";
    if (conflictEntries.length > 2) usefulnessSignal = "noisy";
    else if (conflictEntries.length > 0 || familiesOut.policy.length > 0) usefulnessSignal = "useful";

    bundle.shadowObservation = {
      wouldActivate,
      wouldRequireAck,
      wouldEnforce,
      usefulnessSignal
    };
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
          layered,
          familyCounts: famCounts,
          candidateCount: reg.activations.length,
          conflictCount: conflictEntries.length
        }
      },
      {
        seq: 1,
        eventType: "cae.trace.layer.merge",
        payload: { layered, taskLayerCommand: TASK_LAYER_COMMAND }
      },
      {
        seq: 2,
        eventType: "cae.trace.ack.summary",
        payload: { pendingAckCount: pendingAcknowledgements.length }
      }
    ]
  };

  if (block) {
    (trace.events as Record<string, unknown>[]).push({
      seq: 3,
      eventType: "cae.trace.enforcement.probe",
      payload: { commandName: cmdName, blockId: block.id, matched: true }
    });
  }

  return { bundle, trace, traceId };
}

/**
 * Product-shaped Guidance Rules catalog rows (activation + artifact closure → UI DTO).
 * Pure transform — callers must not mutate registry storage here.
 */

import type {
  CaeLoadedRegistry,
  CaeRegistryActivationRow
} from "../../core/cae/cae-registry-load.js";

export type GuidanceFamilyKind = "policy" | "think" | "do" | "review";

export type GuidanceRuleCatalogAttention = "required" | "check" | "advisory";

export type GuidanceRuleMutationHints = {
  canClone: boolean;
  canActivate: boolean;
  canEditDraft: boolean;
  canRetire: boolean;
  /** Null when coarse mutation gates allow changes (per-row feasibility still lifecycle-gated elsewhere). */
  denialReason: string | null;
};

export type GuidanceRuleCatalogItem = {
  schemaVersion: 1;
  /** Deterministic order within the snapshot (1-based). */
  ordinal: number;
  family: GuidanceFamilyKind;
  /** Product label — e.g. “Rules to follow”. */
  familyLabel: string;
  /** Primary viewer title derived from artifact titles. */
  displayTitle: string;
  /** Plain-language WHEN this Guidance rule evaluates (scoped AND semantics). */
  appliesWhen: string;
  lifecycleState: "draft" | "active" | "retired" | "disabled";
  lifecycleLabel: string;
  priority: number;
  attention: GuidanceRuleCatalogAttention;
  acknowledgementStrength?: string | null;
  acknowledgementTokenPresent?: boolean;
  sources: { title: string }[];
  mutation: GuidanceRuleMutationHints;
  /** Raw CAE identifiers for maintainers / debug tooling only — not product vocabulary. */
  debug: {
    activationId: string;
    artifactIds: string[];
  };
};

export type GuidanceRulesCatalog = {
  schemaVersion: 1;
  /** Active SQLite registry version id when applicable; synthetic tag for digest-backed JSON registries. */
  registrySnapshotTag: string | null;
  itemCount: number;
  degraded?: boolean;
  degradedCode?: string;
  degradedMessage?: string | null;
  items: GuidanceRuleCatalogItem[];
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function describeScopeCondition(cond: Record<string, unknown>): string | null {
  const kind = cond.kind;
  if (kind === "always") return "always applies";
  if (kind === "phaseKey" && typeof cond.value === "string") return `phase is ${cond.value}`;
  if (kind === "commandName") {
    const match = cond.match === "prefix" ? "starts with" : "is exactly";
    const v = typeof cond.value === "string" ? cond.value : "";
    return `command name ${match} ${JSON.stringify(v)}`;
  }
  if (kind === "commandArgEquals" && typeof cond.path === "string") {
    return `argument ${cond.path} equals ${JSON.stringify(cond.value ?? null)}`;
  }
  if (kind === "taskTag") {
    const vals = Array.isArray(cond.values)
      ? (cond.values as unknown[]).filter((x): x is string => typeof x === "string")
      : [];
    const mode = cond.match === "all" ? "all" : "any";
    return vals.length === 0 ? null : `task tags (${mode}) include ${vals.join(", ")}`;
  }
  if (kind === "taskIdPattern" && typeof cond.pattern === "string") {
    return `task id matches /${cond.pattern}/`;
  }
  return null;
}

export function describeActivationScope(scope: unknown): string {
  const s = asRecord(scope);
  const rawConds = s?.conditions;
  const conds = Array.isArray(rawConds)
    ? rawConds.filter(
        (c): c is Record<string, unknown> =>
          !!c && typeof c === "object" && !Array.isArray(c)
      )
    : [];
  if (conds.length === 0) return "Triggers when Guidance evaluates — scope predicates were empty or unrecognized.";
  const parts = conds.map((c) => describeScopeCondition(c)).filter((p): p is string => !!p?.length);
  return parts.length
    ? `Matches when ALL of these are true: ${parts.join("; ")}.`
    : "Triggers when Guidance evaluates.";
}

function asFamily(kind: unknown): GuidanceFamilyKind | null {
  if (kind === "policy" || kind === "think" || kind === "do" || kind === "review") return kind;
  return null;
}

function attentionForFamily(family: GuidanceFamilyKind): GuidanceRuleCatalogAttention {
  if (family === "policy") return "required";
  if (family === "review") return "check";
  return "advisory";
}

function lifecycleLabel(ls: GuidanceRuleCatalogItem["lifecycleState"]): string {
  switch (ls) {
    case "draft":
      return "Draft";
    case "active":
      return "Active";
    case "retired":
      return "Retired";
    case "disabled":
      return "Disabled";
    default:
      return ls;
  }
}

function deriveMutationHints(input: {
  adminMutations: boolean;
  registryStore: string;
  lifecycleState: GuidanceRuleCatalogItem["lifecycleState"];
}): GuidanceRuleMutationHints {
  if (input.registryStore !== "sqlite") {
    return {
      canClone: false,
      canActivate: false,
      canEditDraft: false,
      canRetire: false,
      denialReason: "Guidance registry mutations require SQLite registry store (`kit.cae.registryStore`)."
    };
  }
  if (!input.adminMutations) {
    return {
      canClone: false,
      canActivate: false,
      canEditDraft: false,
      canRetire: false,
      denialReason: "Guidance admin mutations are disabled (`kit.cae.adminMutations`)."
    };
  }

  const st = input.lifecycleState;
  return {
    canClone: true,
    canActivate: st === "draft",
    canEditDraft: st === "draft",
    canRetire: st === "active",
    denialReason: null
  };
}

/** Build deterministic catalog rows for every activation row in the loaded snapshot. Exported for golden tests. */
export function buildRulesCatalogFromRegistry(input: {
  loaded: CaeLoadedRegistry;
  registryStore: string;
  adminMutations: boolean;
  snapshotTag: string | null;
  familyLabels: Record<GuidanceFamilyKind, string>;
}): GuidanceRulesCatalog {
  const acts = [...input.loaded.activations].sort((a, b) =>
    String(a.activationId ?? "").localeCompare(String(b.activationId ?? ""))
  );

  const items: GuidanceRuleCatalogItem[] = [];
  let ordinal = 0;
  for (const raw of acts) {
    ordinal += 1;
    const row = raw as CaeRegistryActivationRow;
    const family = asFamily(row.family);
    if (!family) continue;

    const refs = Array.isArray(row.artifactRefs) ? row.artifactRefs : [];
    const artifactIds = refs
      .map((ref) =>
        ref && typeof ref === "object" && typeof (ref as { artifactId?: unknown }).artifactId === "string"
          ? String((ref as { artifactId: string }).artifactId)
          : ""
      )
      .filter((id) => id.length > 0);

    const sourceTitles = artifactIds
      .map((id) => {
        const art = input.loaded.artifactById.get(id);
        const title =
          art && typeof (art as { title?: unknown }).title === "string"
            ? String((art as { title: string }).title).trim()
            : "";
        return title.length > 0 ? title : id;
      })
      .slice(0, 8);

    const lsRaw = typeof row.lifecycleState === "string" ? row.lifecycleState : "draft";
    const lifecycleState: GuidanceRuleCatalogItem["lifecycleState"] =
      lsRaw === "draft" || lsRaw === "active" || lsRaw === "retired" || lsRaw === "disabled" ? lsRaw : "draft";

    const ack = row.acknowledgement as { strength?: unknown; token?: unknown } | undefined;
    const acknowledgementStrength =
      typeof ack?.strength === "string" && ack.strength.length > 0 ? ack.strength : null;
    const acknowledgementTokenPresent =
      typeof ack?.token === "string" && String(ack.token).trim().length > 0;

    items.push({
      schemaVersion: 1,
      ordinal,
      family,
      familyLabel: input.familyLabels[family],
      displayTitle: sourceTitles[0] ?? String(row.activationId ?? "Guidance rule"),
      appliesWhen: describeActivationScope(row.scope),
      lifecycleState,
      lifecycleLabel: lifecycleLabel(lifecycleState),
      priority: Number(row.priority ?? 0),
      attention: attentionForFamily(family),
      acknowledgementStrength,
      acknowledgementTokenPresent,
      sources: sourceTitles.map((title) => ({ title })),
      mutation: deriveMutationHints({
        adminMutations: input.adminMutations,
        registryStore: input.registryStore,
        lifecycleState
      }),
      debug: {
        activationId: String(row.activationId ?? ""),
        artifactIds
      }
    });
  }

  return {
    schemaVersion: 1,
    registrySnapshotTag: input.snapshotTag,
    itemCount: items.length,
    items
  };
}

/** Top-level aggregator used by `cae-dashboard-summary` product model. */
export function buildGuidanceRulesCatalogEnvelope(input: {
  loadedOk: boolean;
  loaded: CaeLoadedRegistry | null;
  health: Record<string, unknown>;
  registryStoreRaw: unknown;
  adminMutations: boolean;
  familyLabels: Record<GuidanceFamilyKind, string>;
  loadFail?: { code?: string; message?: string };
}): GuidanceRulesCatalog {
  const store = typeof input.registryStoreRaw === "string" ? input.registryStoreRaw : "sqlite";
  const versionId =
    typeof input.health.activeRegistryVersionId === "string" ? input.health.activeRegistryVersionId : null;

  if (!input.loadedOk || !input.loaded) {
    return {
      schemaVersion: 1,
      registrySnapshotTag: versionId,
      itemCount: 0,
      items: [],
      degraded: true,
      degradedCode: input.loadFail?.code ?? "cae-registry-unavailable",
      degradedMessage: input.loadFail?.message ?? "Registry unavailable for Guidance rules catalog."
    };
  }

  const digestSnippet = `${store}:${input.loaded.registryDigest.slice(0, 12)}`;
  const snapshotTag = store === "json" ? digestSnippet : versionId ?? digestSnippet;

  return buildRulesCatalogFromRegistry({
    loaded: input.loaded,
    registryStore: store,
    adminMutations: input.adminMutations,
    snapshotTag,
    familyLabels: input.familyLabels
  });
}

import { BEHAVIOR_PROFILE_SCHEMA_VERSION, type BehaviorDimensions, type BehaviorProfile } from "./types.js";

const ID_RE = /^(builtin|custom):[a-z0-9-]+$/;

const FORBIDDEN_NOTE_SNIPPETS = [
  "ignore policy",
  "bypass policy",
  "skip approval",
  "no approval",
  "without approval",
  "chat-only approval",
  "override principles",
  "skip tests",
  "delete production",
  "exfiltrate"
];

const DIMENSION_KEYS: (keyof BehaviorDimensions)[] = [
  "deliberationDepth",
  "changeAppetite",
  "checkInFrequency",
  "explanationVerbosity",
  "explorationStyle",
  "ambiguityHandling"
];

const ENUMS: Record<keyof BehaviorDimensions, Set<string>> = {
  deliberationDepth: new Set(["low", "medium", "high"]),
  changeAppetite: new Set(["conservative", "balanced", "bold"]),
  checkInFrequency: new Set(["rare", "normal", "often"]),
  explanationVerbosity: new Set(["terse", "normal", "verbose"]),
  explorationStyle: new Set(["linear", "parallel"]),
  ambiguityHandling: new Set(["decide", "ask"])
};

export function validateBehaviorProfile(
  raw: unknown,
  options: { allowBuiltinId?: boolean } = {}
): { ok: true; profile: BehaviorProfile } | { ok: false; message: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, message: "Profile must be a non-array object" };
  }
  const o = raw as Record<string, unknown>;
  if (o.schemaVersion !== BEHAVIOR_PROFILE_SCHEMA_VERSION) {
    return { ok: false, message: `schemaVersion must be ${BEHAVIOR_PROFILE_SCHEMA_VERSION}` };
  }
  const id = typeof o.id === "string" ? o.id.trim() : "";
  if (!ID_RE.test(id)) {
    return { ok: false, message: "id must match builtin:<slug> or custom:<slug> (slug: a-z0-9-)" };
  }
  if (id.startsWith("builtin:") && !options.allowBuiltinId) {
    return { ok: false, message: "Cannot use builtin id for custom profile persistence" };
  }
  if (!id.startsWith("custom:") && !id.startsWith("builtin:")) {
    return { ok: false, message: "Invalid id namespace" };
  }
  const label = typeof o.label === "string" ? o.label.trim() : "";
  const summary = typeof o.summary === "string" ? o.summary.trim() : "";
  if (!label || label.length > 120) {
    return { ok: false, message: "label required, max 120 chars" };
  }
  if (!summary || summary.length > 500) {
    return { ok: false, message: "summary required, max 500 chars" };
  }
  const dimsIn = o.dimensions;
  if (!dimsIn || typeof dimsIn !== "object" || Array.isArray(dimsIn)) {
    return { ok: false, message: "dimensions object required" };
  }
  const drec = dimsIn as Record<string, unknown>;
  const dimensions = {} as Record<keyof BehaviorDimensions, string>;
  for (const key of DIMENSION_KEYS) {
    const v = drec[key as string];
    if (typeof v !== "string" || !ENUMS[key].has(v)) {
      return { ok: false, message: `dimensions.${key} has invalid value` };
    }
    dimensions[key] = v;
  }
  let interactionNotes: string | undefined;
  if (o.interactionNotes !== undefined) {
    if (typeof o.interactionNotes !== "string") {
      return { ok: false, message: "interactionNotes must be a string" };
    }
    interactionNotes = o.interactionNotes.trim();
    if (interactionNotes.length > 2000) {
      return { ok: false, message: "interactionNotes max 2000 chars" };
    }
    const lower = interactionNotes.toLowerCase();
    for (const bad of FORBIDDEN_NOTE_SNIPPETS) {
      if (lower.includes(bad)) {
        return {
          ok: false,
          message: `interactionNotes must not suggest policy or approval bypass (matched: ${bad})`
        };
      }
    }
  }
  const profile: BehaviorProfile = {
    schemaVersion: BEHAVIOR_PROFILE_SCHEMA_VERSION,
    id,
    label,
    summary,
    dimensions: dimensions as BehaviorDimensions,
    interactionNotes,
    metadata: typeof o.metadata === "object" && o.metadata !== null && !Array.isArray(o.metadata)
      ? (o.metadata as Record<string, unknown>)
      : undefined
  };
  if (typeof o.extends === "string" && o.extends.trim().length > 0) {
    const ex = o.extends.trim();
    if (!ID_RE.test(ex)) {
      return { ok: false, message: "extends must be a valid profile id" };
    }
    profile.extends = ex;
  }
  return { ok: true, profile };
}

export function mergeDimensions(
  base: BehaviorDimensions,
  patch: Partial<BehaviorDimensions> | undefined
): BehaviorDimensions {
  if (!patch) return { ...base };
  const out: Record<keyof BehaviorDimensions, string> = { ...base };
  for (const key of DIMENSION_KEYS) {
    if (patch[key] !== undefined) {
      const v = patch[key]!;
      if (!ENUMS[key].has(v)) {
        throw new Error(`Invalid dimension ${key}`);
      }
      out[key] = v;
    }
  }
  return out as BehaviorDimensions;
}

import type {
  BrainstormIdeationRationaleItem,
  BrainstormIdeationTextItem,
  BrainstormIdeationTranscriptEntry,
  BrainstormSessionIdeation
} from "./idea-plan-types.js";

function cleanString(raw: unknown): string | undefined {
  return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
}

function parseTextItems(raw: unknown): BrainstormIdeationTextItem[] | undefined {
  if (!Array.isArray(raw)) {
    return undefined;
  }
  const items: BrainstormIdeationTextItem[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      continue;
    }
    const text = cleanString((entry as { text?: unknown }).text);
    if (text) {
      items.push({ text });
    }
  }
  return items.length > 0 ? items : undefined;
}

function parseRationaleItems(raw: unknown): BrainstormIdeationRationaleItem[] | undefined {
  if (!Array.isArray(raw)) {
    return undefined;
  }
  const items: BrainstormIdeationRationaleItem[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      continue;
    }
    const source = entry as { text?: unknown; rationale?: unknown };
    const text = cleanString(source.text);
    if (!text) {
      continue;
    }
    const rationale = cleanString(source.rationale);
    items.push(rationale ? { text, rationale } : { text });
  }
  return items.length > 0 ? items : undefined;
}

function parseTranscriptEntries(raw: unknown): BrainstormIdeationTranscriptEntry[] | undefined {
  if (!Array.isArray(raw)) {
    return undefined;
  }
  const items: BrainstormIdeationTranscriptEntry[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      continue;
    }
    const source = entry as { role?: unknown; text?: unknown; at?: unknown };
    const role = source.role === "agent" || source.role === "operator" ? source.role : undefined;
    const text = cleanString(source.text);
    const at = cleanString(source.at);
    if (role && text && at) {
      items.push({ role, text, at });
    }
  }
  return items.length > 0 ? items : undefined;
}

export function parseBrainstormSessionIdeationPatch(raw: unknown): Partial<BrainstormSessionIdeation> | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return undefined;
  }
  const source = raw as Record<string, unknown>;
  const patch: Partial<BrainstormSessionIdeation> = {};
  const featureIdeas = parseRationaleItems(source.featureIdeas);
  if (featureIdeas) {
    patch.featureIdeas = featureIdeas;
  }
  const perspectives = parseTextItems(source.perspectives);
  if (perspectives) {
    patch.perspectives = perspectives;
  }
  const expectations = parseTextItems(source.expectations);
  if (expectations) {
    patch.expectations = expectations;
  }
  const openThreads = parseTextItems(source.openThreads);
  if (openThreads) {
    patch.openThreads = openThreads;
  }
  const decisions = parseRationaleItems(source.decisions);
  if (decisions) {
    patch.decisions = decisions;
  }
  const transcript = parseTranscriptEntries(source.transcript);
  if (transcript) {
    patch.transcript = transcript;
  }
  return Object.keys(patch).length > 0 ? patch : undefined;
}

export function mergeBrainstormSessionIdeation(
  existing: BrainstormSessionIdeation | undefined,
  patch: Partial<BrainstormSessionIdeation>
): BrainstormSessionIdeation {
  const merged: BrainstormSessionIdeation = { ...(existing ?? {}) };
  if (patch.featureIdeas) {
    merged.featureIdeas = patch.featureIdeas;
  }
  if (patch.perspectives) {
    merged.perspectives = patch.perspectives;
  }
  if (patch.expectations) {
    merged.expectations = patch.expectations;
  }
  if (patch.openThreads) {
    merged.openThreads = patch.openThreads;
  }
  if (patch.decisions) {
    merged.decisions = patch.decisions;
  }
  if (patch.transcript) {
    merged.transcript = [...(existing?.transcript ?? []), ...patch.transcript];
  }
  return merged;
}

/** True when qualitative ideation is rich enough to complete a session without full scoring. */
export function hasSubstantialBrainstormIdeation(ideation: BrainstormSessionIdeation | undefined): boolean {
  if (!ideation) {
    return false;
  }
  const curatedCount =
    (ideation.featureIdeas?.length ?? 0) +
    (ideation.perspectives?.length ?? 0) +
    (ideation.expectations?.length ?? 0) +
    (ideation.openThreads?.length ?? 0) +
    (ideation.decisions?.length ?? 0);
  return curatedCount >= 2;
}

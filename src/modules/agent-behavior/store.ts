import { BUILTIN_PROFILES, DEFAULT_BUILTIN_PROFILE_ID } from "./builtins.js";
import { mergeDimensions, validateBehaviorProfile } from "./validate.js";
import type { BehaviorProfile, BehaviorWorkspaceStateV1, BehaviorProvenanceEntry } from "./types.js";

export class BehaviorProfileStore {
  private state: BehaviorWorkspaceStateV1;

  constructor(initial: BehaviorWorkspaceStateV1) {
    this.state = initial;
  }

  getState(): BehaviorWorkspaceStateV1 {
    return this.state;
  }

  listIds(): { id: string; label: string; kind: "builtin" | "custom" }[] {
    const out: { id: string; label: string; kind: "builtin" | "custom" }[] = [];
    for (const [id, p] of Object.entries(BUILTIN_PROFILES)) {
      out.push({ id, label: p.label, kind: "builtin" });
    }
    for (const [id, p] of Object.entries(this.state.customProfiles)) {
      out.push({ id, label: p.label, kind: "custom" });
    }
    return out.sort((a, b) => a.id.localeCompare(b.id));
  }

  getRawProfile(id: string): BehaviorProfile | null {
    if (BUILTIN_PROFILES[id]) {
      return { ...BUILTIN_PROFILES[id], dimensions: { ...BUILTIN_PROFILES[id].dimensions } };
    }
    const c = this.state.customProfiles[id];
    if (!c) return null;
    return {
      ...c,
      dimensions: { ...c.dimensions },
      metadata: c.metadata ? { ...c.metadata } : undefined
    };
  }

  /** Resolve `extends` chain; returns null if missing or cycle (cycle truncated). */
  resolveProfile(id: string, stack = new Set<string>()): BehaviorProfile | null {
    if (stack.has(id)) {
      return null;
    }
    stack.add(id);
    const raw = this.getRawProfile(id);
    if (!raw) {
      stack.delete(id);
      return null;
    }
    if (!raw.extends) {
      stack.delete(id);
      return raw;
    }
    const base = this.resolveProfile(raw.extends, stack);
    stack.delete(id);
    if (!base) {
      return raw;
    }
    return {
      ...base,
      ...raw,
      id: raw.id,
      label: raw.label,
      summary: raw.summary,
      dimensions: mergeDimensions(base.dimensions, raw.dimensions),
      interactionNotes: raw.interactionNotes ?? base.interactionNotes,
      extends: raw.extends,
      metadata: raw.metadata ?? base.metadata
    };
  }

  getActiveProfileId(): string | null {
    return this.state.activeProfileId;
  }

  setActiveProfileId(id: string | null): void {
    this.state.activeProfileId = id;
  }

  putCustomProfile(profile: BehaviorProfile): void {
    this.state.customProfiles[profile.id] = profile;
  }

  deleteCustomProfile(id: string): void {
    delete this.state.customProfiles[id];
  }

  resolveEffectiveWithProvenance(): {
    effective: BehaviorProfile;
    provenance: BehaviorProvenanceEntry[];
  } {
    const provenance: BehaviorProvenanceEntry[] = [
      { source: "default", profileId: DEFAULT_BUILTIN_PROFILE_ID }
    ];
    let chosen = DEFAULT_BUILTIN_PROFILE_ID;
    const active = this.state.activeProfileId;
    if (active) {
      const resolved = this.resolveProfile(active);
      if (resolved) {
        chosen = active;
        provenance.push({ source: "active", profileId: active });
        return { effective: resolved, provenance };
      }
      provenance.push({ source: "fallback", profileId: DEFAULT_BUILTIN_PROFILE_ID });
    }
    const fallback = this.resolveProfile(DEFAULT_BUILTIN_PROFILE_ID);
    return {
      effective: fallback ?? BUILTIN_PROFILES[DEFAULT_BUILTIN_PROFILE_ID]!,
      provenance
    };
  }
}

export function materializeCustomFromBase(
  baseId: string,
  store: BehaviorProfileStore,
  newId: string,
  overrides: {
    label?: string;
    summary?: string;
    dimensions?: Partial<BehaviorProfile["dimensions"]>;
    interactionNotes?: string;
  }
): { ok: true; profile: BehaviorProfile } | { ok: false; message: string } {
  const baseResolved = store.resolveProfile(baseId);
  if (!baseResolved) {
    return { ok: false, message: `Base profile '${baseId}' not found` };
  }
  const label = overrides.label?.trim() || `${baseResolved.label} (custom)`;
  const summary = overrides.summary?.trim() || baseResolved.summary;
  const dimensions = mergeDimensions(baseResolved.dimensions, overrides.dimensions);
  const draft = {
    schemaVersion: 1 as const,
    id: newId,
    extends: baseId,
    label,
    summary,
    dimensions,
    interactionNotes: overrides.interactionNotes?.trim(),
    metadata: { source: "fork", createdAt: new Date().toISOString(), baseProfileId: baseId }
  };
  return validateBehaviorProfile(draft);
}

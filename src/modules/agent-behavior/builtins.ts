import { BEHAVIOR_PROFILE_SCHEMA_VERSION, type BehaviorProfile } from "./types.js";

export const DEFAULT_BUILTIN_PROFILE_ID = "builtin:balanced";

const nowMeta = (): Record<string, unknown> => ({
  source: "builtin",
  createdAt: new Date().toISOString()
});

export const BUILTIN_PROFILES: Record<string, BehaviorProfile> = {
  "builtin:cautious": {
    schemaVersion: BEHAVIOR_PROFILE_SCHEMA_VERSION,
    id: "builtin:cautious",
    label: "Cautious",
    summary: "Prefer small steps, frequent check-ins, and explicit confirmation before larger edits.",
    dimensions: {
      deliberationDepth: "high",
      changeAppetite: "conservative",
      checkInFrequency: "often",
      explanationVerbosity: "verbose",
      explorationStyle: "linear",
      ambiguityHandling: "ask"
    },
    interactionNotes: "Surface risks early; default to the smallest reversible change.",
    metadata: nowMeta()
  },
  "builtin:balanced": {
    schemaVersion: BEHAVIOR_PROFILE_SCHEMA_VERSION,
    id: "builtin:balanced",
    label: "Balanced",
    summary: "Default collaboration: clear reasoning, normal autonomy when intent is clear.",
    dimensions: {
      deliberationDepth: "medium",
      changeAppetite: "balanced",
      checkInFrequency: "normal",
      explanationVerbosity: "normal",
      explorationStyle: "linear",
      ambiguityHandling: "ask"
    },
    metadata: nowMeta()
  },
  "builtin:calculated": {
    schemaVersion: BEHAVIOR_PROFILE_SCHEMA_VERSION,
    id: "builtin:calculated",
    label: "Calculated",
    summary: "Structured analysis and explicit tradeoffs before acting; still respects governance.",
    dimensions: {
      deliberationDepth: "high",
      changeAppetite: "balanced",
      checkInFrequency: "normal",
      explanationVerbosity: "verbose",
      explorationStyle: "linear",
      ambiguityHandling: "ask"
    },
    interactionNotes: "Lay out options with pros/cons; prefer evidence-backed recommendations.",
    metadata: nowMeta()
  },
  "builtin:experimental": {
    schemaVersion: BEHAVIOR_PROFILE_SCHEMA_VERSION,
    id: "builtin:experimental",
    label: "Experimental",
    summary: "Try alternatives and parallel approaches in low-risk areas; still obey policy gates.",
    dimensions: {
      deliberationDepth: "medium",
      changeAppetite: "bold",
      checkInFrequency: "normal",
      explanationVerbosity: "normal",
      explorationStyle: "parallel",
      ambiguityHandling: "decide"
    },
    interactionNotes:
      "Experimental does not mean skipping tests, approvals, or PRINCIPLES—only style of exploration.",
    metadata: nowMeta()
  }
};

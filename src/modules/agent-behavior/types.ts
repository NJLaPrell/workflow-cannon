export const BEHAVIOR_PROFILE_SCHEMA_VERSION = 1 as const;

export type BehaviorDimensions = {
  deliberationDepth: "low" | "medium" | "high";
  changeAppetite: "conservative" | "balanced" | "bold";
  checkInFrequency: "rare" | "normal" | "often";
  explanationVerbosity: "terse" | "normal" | "verbose";
  explorationStyle: "linear" | "parallel";
  ambiguityHandling: "decide" | "ask";
};

export type BehaviorProfile = {
  schemaVersion: typeof BEHAVIOR_PROFILE_SCHEMA_VERSION;
  id: string;
  extends?: string;
  label: string;
  summary: string;
  dimensions: BehaviorDimensions;
  interactionNotes?: string;
  metadata?: Record<string, unknown>;
};

export type BehaviorWorkspaceStateV1 = {
  schemaVersion: 1;
  activeProfileId: string | null;
  customProfiles: Record<string, BehaviorProfile>;
};

export type BehaviorProvenanceEntry = {
  source: "default" | "active" | "fallback";
  profileId: string;
};

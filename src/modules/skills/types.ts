export type SkillPackRecord = {
  id: string;
  version: string;
  displayName: string;
  description: string;
  discoveryTags: string[];
  instructionsRelPath: string;
  /** Absolute path to skill directory */
  rootPath: string;
  layout: "claude-shaped";
  hasSidecar: boolean;
};

export type SkillDiscoveryResult =
  | { ok: true; packs: SkillPackRecord[] }
  | { ok: false; code: string; message: string };

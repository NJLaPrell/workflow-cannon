/** Canonical npm package name for this kit (manifest + drift checks). */
export const CANONICAL_KIT_NAME = "@workflow-cannon/workspace-kit" as const;

export const defaultWorkspaceKitPaths = {
  profile: "workspace-kit.profile.json",
  profileSchema: "schemas/workspace-kit-profile.schema.json",
  manifest: ".workspace-kit/manifest.json",
  ownedPaths: ".workspace-kit/owned-paths.json"
} as const;

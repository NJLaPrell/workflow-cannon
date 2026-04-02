/** Baseline schema JSON written by `workspace-kit upgrade` (profile template). */
export const profileSchemaContent = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://example.com/schemas/workspace-kit-profile.schema.json",
  title: "Workspace Kit Profile",
  type: "object",
  required: ["project", "packageManager", "commands", "github"],
  properties: {
    project: {
      type: "object",
      required: ["name"],
      properties: {
        name: {
          type: "string",
          minLength: 1
        }
      },
      additionalProperties: true
    },
    packageManager: {
      type: "string",
      enum: ["pnpm", "npm", "yarn"]
    },
    commands: {
      type: "object",
      required: ["test", "lint", "typecheck"],
      properties: {
        test: {
          type: "string",
          minLength: 1
        },
        lint: {
          type: "string",
          minLength: 1
        },
        typecheck: {
          type: "string",
          minLength: 1
        }
      },
      additionalProperties: true
    },
    github: {
      type: "object",
      required: ["defaultBranch"],
      properties: {
        defaultBranch: {
          type: "string",
          minLength: 1
        }
      },
      additionalProperties: true
    }
  },
  additionalProperties: true
} as const;

export const pointerRuleContent = `# Workspace Kit Profile Pointer

Project-specific identity/config values should come from \`workspace-kit.profile.json\` and generated artifacts under \`.workspace-kit/generated/\`.

Do not hardcode project names in rules. Run \`workspace-kit init\` after profile edits to regenerate project-context snippets.
`;

/** Default owned-path entries when manifest policy is missing or invalid. */
export const currentOwnedPaths: string[] = [
  "workspace-kit.profile.json",
  "schemas/workspace-kit-profile.schema.json",
  ".workspace-kit/manifest.json",
  ".workspace-kit/owned-paths.json",
  ".cursor/rules/workspace-kit-profile-pointer.mdc",
  ".workspace-kit/generated/project-context.json",
  ".cursor/rules/workspace-kit-project-context.mdc"
];

export const allowedPackageManagers = new Set(["pnpm", "npm", "yarn"]);

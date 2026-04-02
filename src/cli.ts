#!/usr/bin/env node

import { realpathSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  AGENT_CLI_MAP_HUMAN_DOC,
  POLICY_APPROVAL_HUMAN_DOC,
  POLICY_APPROVAL_TWO_LANES_DOC,
  appendPolicyTrace,
  parsePolicyApprovalFromEnv,
  resolveActorWithFallback,
  type PolicyOperationId
} from "./core/policy.js";
import { buildAgentInstructionSurface } from "./core/agent-instruction-surface.js";
import { runWorkspaceConfigCli } from "./core/config-cli.js";
import { handleRunCommand } from "./cli/run-command.js";
import {
  collectDoctorPlanningPersistenceIssues,
  collectPolicyLaneEnvDoctorSummaryLines,
  collectTaskPersistenceDoctorSummaryLines
} from "./cli/doctor-planning-issues.js";
import { ModuleRegistryError } from "./core/module-registry.js";
import { loadWorkspaceDotenv } from "./core/load-workspace-dotenv.js";
import { resolveRegistryAndConfig } from "./core/module-registry-resolve.js";
import { defaultRegistryModules } from "./modules/index.js";

const EXIT_SUCCESS = 0;
const EXIT_VALIDATION_FAILURE = 1;
const EXIT_USAGE_ERROR = 2;
const EXIT_INTERNAL_ERROR = 3;
const CANONICAL_KIT_NAME = "@workflow-cannon/workspace-kit";

export const defaultWorkspaceKitPaths = {
  profile: "workspace-kit.profile.json",
  profileSchema: "schemas/workspace-kit-profile.schema.json",
  manifest: ".workspace-kit/manifest.json",
  ownedPaths: ".workspace-kit/owned-paths.json"
} as const;

export type WorkspaceKitCliOptions = {
  cwd?: string;
  writeLine?: (message: string) => void;
  writeError?: (message: string) => void;
  /** Test hook: simulated stdin lines for interactive sensitive-command approval */
  readStdinLine?: () => Promise<string | null>;
};

type DoctorIssue = {
  path: string;
  reason: string;
};

type OwnedPathsDocument = {
  schemaVersion: number;
  ownedPaths: string[];
  notes?: string;
};

const allowedPackageManagers = new Set(["pnpm", "npm", "yarn"]);

const currentOwnedPaths: string[] = [
  "workspace-kit.profile.json",
  "schemas/workspace-kit-profile.schema.json",
  ".workspace-kit/manifest.json",
  ".workspace-kit/owned-paths.json",
  ".cursor/rules/workspace-kit-profile-pointer.mdc",
  ".workspace-kit/generated/project-context.json",
  ".cursor/rules/workspace-kit-project-context.mdc"
];

const pointerRuleContent = `# Workspace Kit Profile Pointer

Project-specific identity/config values should come from \`workspace-kit.profile.json\` and generated artifacts under \`.workspace-kit/generated/\`.

Do not hardcode project names in rules. Run \`workspace-kit init\` after profile edits to regenerate project-context snippets.
`;

const profileSchemaContent = {
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
};

type WorkspaceKitProfile = {
  project: { name: string };
  packageManager: "pnpm" | "npm" | "yarn";
  commands: {
    test: string;
    lint: string;
    typecheck: string;
  };
  github: {
    defaultBranch: string;
  };
};

export async function parseJsonFile(filePath: string): Promise<unknown> {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function requireCliPolicyApproval(
  cwd: string,
  operationId: PolicyOperationId,
  commandLabel: string,
  writeError: (message: string) => void
): Promise<{ rationale: string } | null> {
  const approval = parsePolicyApprovalFromEnv(process.env);
  if (!approval) {
    writeError(
      `workspace-kit ${commandLabel} (${operationId}) requires WORKSPACE_KIT_POLICY_APPROVAL with JSON {"confirmed":true,"rationale":"..."} (env lane). Sensitive workspace-kit run commands use JSON policyApproval instead — see ${POLICY_APPROVAL_TWO_LANES_DOC}.`
    );
    await appendPolicyTrace(cwd, {
      timestamp: new Date().toISOString(),
      operationId,
      command: commandLabel,
      actor: await resolveActorWithFallback(cwd, {}, process.env),
      allowed: false,
      message: "missing WORKSPACE_KIT_POLICY_APPROVAL"
    });
    return null;
  }
  return { rationale: approval.rationale };
}

async function recordCliPolicySuccess(
  cwd: string,
  operationId: PolicyOperationId,
  commandLabel: string,
  rationale: string,
  commandOk: boolean
): Promise<void> {
  await appendPolicyTrace(cwd, {
    timestamp: new Date().toISOString(),
    operationId,
    command: commandLabel,
    actor: await resolveActorWithFallback(cwd, {}, process.env),
    allowed: true,
    rationale,
    commandOk
  });
}

function readStringField(
  objectValue: Record<string, unknown>,
  key: string,
  errors: string[],
  fieldPath: string
): string | undefined {
  const value = objectValue[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    errors.push(`${fieldPath} must be a non-empty string`);
    return undefined;
  }

  return value;
}

async function validateProfile(
  cwd: string
): Promise<{ errors: string[]; profile?: WorkspaceKitProfile }> {
  const profilePath = path.join(cwd, defaultWorkspaceKitPaths.profile);
  const errors: string[] = [];
  let profile: unknown;

  try {
    profile = await parseJsonFile(profilePath);
  } catch {
    return { errors: [`${defaultWorkspaceKitPaths.profile} is missing or invalid JSON`] };
  }

  if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
    return { errors: ["workspace-kit profile root must be an object"] };
  }

  const profileObject = profile as Record<string, unknown>;
  const project = profileObject.project;
  const commands = profileObject.commands;
  const github = profileObject.github;
  const packageManager = profileObject.packageManager;

  if (!project || typeof project !== "object" || Array.isArray(project)) {
    errors.push("project must be an object");
  } else {
    readStringField(project as Record<string, unknown>, "name", errors, "project.name");
  }

  if (typeof packageManager !== "string" || !allowedPackageManagers.has(packageManager)) {
    errors.push("packageManager must be one of: pnpm, npm, yarn");
  }

  if (!commands || typeof commands !== "object" || Array.isArray(commands)) {
    errors.push("commands must be an object");
  } else {
    const commandsObject = commands as Record<string, unknown>;
    readStringField(commandsObject, "test", errors, "commands.test");
    readStringField(commandsObject, "lint", errors, "commands.lint");
    readStringField(commandsObject, "typecheck", errors, "commands.typecheck");
  }

  if (!github || typeof github !== "object" || Array.isArray(github)) {
    errors.push("github must be an object");
  } else {
    readStringField(
      github as Record<string, unknown>,
      "defaultBranch",
      errors,
      "github.defaultBranch"
    );
  }

  if (errors.length > 0) {
    return { errors };
  }

  const validatedProject = profileObject.project as Record<string, unknown>;
  const validatedCommands = profileObject.commands as Record<string, unknown>;
  const validatedGithub = profileObject.github as Record<string, unknown>;
  const validatedPackageManager =
    profileObject.packageManager as WorkspaceKitProfile["packageManager"];

  return {
    errors,
    profile: {
      project: { name: validatedProject.name as string },
      packageManager: validatedPackageManager,
      commands: {
        test: validatedCommands.test as string,
        lint: validatedCommands.lint as string,
        typecheck: validatedCommands.typecheck as string
      },
      github: {
        defaultBranch: validatedGithub.defaultBranch as string
      }
    }
  };
}

async function generateProfileDrivenArtifacts(
  cwd: string,
  profile: WorkspaceKitProfile
): Promise<{ generatedJsonPath: string; generatedRulePath: string }> {
  const generatedJsonPath = path.join(cwd, ".workspace-kit", "generated", "project-context.json");
  const generatedRulePath = path.join(cwd, ".cursor", "rules", "workspace-kit-project-context.mdc");
  const renderedArtifacts = renderProfileDrivenArtifacts(profile);

  await fs.mkdir(path.dirname(generatedJsonPath), { recursive: true });
  await fs.writeFile(generatedJsonPath, renderedArtifacts.generatedContextJson, "utf8");

  await fs.mkdir(path.dirname(generatedRulePath), { recursive: true });
  await fs.writeFile(generatedRulePath, renderedArtifacts.generatedRuleText, "utf8");

  return { generatedJsonPath, generatedRulePath };
}

function toJsonWithTrailingNewline(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function renderProfileDrivenArtifacts(profile: WorkspaceKitProfile): {
  generatedContextJson: string;
  generatedRuleText: string;
} {
  const generatedContext = {
    generatedFrom: defaultWorkspaceKitPaths.profile,
    projectName: profile.project.name,
    packageManager: profile.packageManager,
    commands: profile.commands,
    github: profile.github
  };

  const generatedRuleText = [
    "# Workspace Kit Project Context (Generated)",
    "",
    "This file is generated by `workspace-kit init`.",
    "Do not hand-edit project identity values here; update `workspace-kit.profile.json` and rerun init.",
    "",
    `- project_name: ${profile.project.name}`,
    `- package_manager: ${profile.packageManager}`,
    `- default_branch: ${profile.github.defaultBranch}`,
    `- test_command: ${profile.commands.test}`,
    `- lint_command: ${profile.commands.lint}`,
    `- typecheck_command: ${profile.commands.typecheck}`,
    "",
    "When instructions need project-specific values, prefer this generated file or `.workspace-kit/generated/project-context.json`."
  ].join("\n");

  return {
    generatedContextJson: toJsonWithTrailingNewline(generatedContext),
    generatedRuleText: `${generatedRuleText}\n`
  };
}

function createDriftExpectedAssets(profile: WorkspaceKitProfile): Map<string, string> {
  const generated = renderProfileDrivenArtifacts(profile);
  return new Map<string, string>([
    [defaultWorkspaceKitPaths.profileSchema, toJsonWithTrailingNewline(profileSchemaContent)],
    [".cursor/rules/workspace-kit-profile-pointer.mdc", pointerRuleContent],
    [".workspace-kit/generated/project-context.json", generated.generatedContextJson],
    [".cursor/rules/workspace-kit-project-context.mdc", generated.generatedRuleText]
  ]);
}

function driftContentMatches(
  relativePath: string,
  existingContent: string,
  expectedContent: string
): boolean {
  if (!relativePath.endsWith(".json")) {
    return existingContent === expectedContent;
  }

  try {
    const existingJson = JSON.parse(existingContent);
    const expectedJson = JSON.parse(expectedContent);
    return JSON.stringify(existingJson) === JSON.stringify(expectedJson);
  } catch {
    return existingContent === expectedContent;
  }
}

async function resolvePackageVersion(cwd: string): Promise<string | undefined> {
  const candidatePaths = [
    path.join(cwd, "packages", "workspace-kit", "package.json"),
    path.join(cwd, "package.json")
  ];

  for (const candidatePath of candidatePaths) {
    try {
      const parsed = await parseJsonFile(candidatePath);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const version = (parsed as Record<string, unknown>).version;
        const name = (parsed as Record<string, unknown>).name;
        if (typeof version === "string" && version.length > 0 && typeof name === "string") {
          if (
            name === CANONICAL_KIT_NAME ||
            name === "quicktask-workspace-kit" ||
            candidatePath.endsWith("packages/workspace-kit/package.json")
          ) {
            return version;
          }
        }
      }
    } catch {
      continue;
    }
  }

  return undefined;
}

/** Version from the installed kit package (works from repo `dist/` or `node_modules`). */
async function readCliBundledPackageVersion(): Promise<string | undefined> {
  try {
    const pkgPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "package.json");
    const parsed = await parseJsonFile(pkgPath);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const v = (parsed as Record<string, unknown>).version;
      return typeof v === "string" && v.length > 0 ? v : undefined;
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

function writeDoctorFailureRemediation(
  writeError: (message: string) => void,
  issues: DoctorIssue[]
): void {
  writeError("");
  writeError("Next steps:");
  const hasMissing = issues.some((issue) => issue.reason === "missing");
  if (hasMissing) {
    writeError(
      "  - Kit files missing: run workspace-kit upgrade from the repo root (set WORKSPACE_KIT_POLICY_APPROVAL — see docs/maintainers/POLICY-APPROVAL.md)."
    );
  }
  writeError("  - workspace-kit --help — orientation and top-level commands");
  writeError("  - workspace-kit run — list module commands (after doctor passes)");
  const phaseMismatch = issues.some((issue) => issue.reason === "kit-phase-config-status-yaml-mismatch");
  if (phaseMismatch) {
    writeError(
      "  - Phase snapshot mismatch (kit.currentPhaseNumber vs docs/maintainers/data/workspace-kit-status.yaml): align both, or run workspace-kit run update-workspace-phase-snapshot '{\"currentKitPhase\":\"N\"}' (and optionally nextKitPhase) — see docs/maintainers/AGENTS.md (workspace phase snapshot)."
    );
  }
}

async function printWorkspaceKitTopLevelHelp(writeLine: (message: string) => void): Promise<void> {
  const version = await readCliBundledPackageVersion();
  const versionSuffix = version ? ` v${version}` : "";
  writeLine(`Workflow Cannon — workspace-kit${versionSuffix} (${CANONICAL_KIT_NAME})`);
  writeLine("");
  writeLine("CLI for deterministic, policy-governed task workflows.");
  writeLine("Command discovery: run `workspace-kit run` with no subcommand (after `doctor` passes) to print every module command.");
  writeLine("Also installed as the short command `wk` (same binary as `workspace-kit`).");
  writeLine("");
  writeLine("Start here (first time in a kit-enabled repo)");
  writeLine("  1) workspace-kit doctor   (or: wk doctor)");
  writeLine("  2) workspace-kit run              ← lists every module command (your command menu)");
  writeLine("  3) workspace-kit run get-next-actions '{}'   ← safe read: suggested next work");
  writeLine("");
  writeLine("Top-level commands");
  writeLine("  doctor          Validate kit contract files, config, and persistence checks");
  writeLine("  doctor --agent-instruction-surface   JSON catalog of all declared instructions");
  writeLine("  run <cmd> [json]  Run a module command; omit <cmd> to list runnable commands");
  writeLine("  config          Show or change kit config (mutations need env approval — see below)");
  writeLine("  check           Validate workspace-kit.profile.json");
  writeLine("  init            Regenerate profile-driven artifacts (needs env approval)");
  writeLine("  upgrade         Refresh kit-managed baseline files (needs env approval)");
  writeLine("  drift-check     Fail if managed kit assets differ from expected content");
  writeLine("");
  writeLine("Policy & docs (paths are relative to a clone of this repo; npm consumers: open the package or docs site)");
  writeLine(`  ${AGENT_CLI_MAP_HUMAN_DOC} — tier table, copy-paste JSON for agents`);
  writeLine(`  ${POLICY_APPROVAL_HUMAN_DOC} — when policyApproval JSON vs env approval applies`);
  writeLine("");
  writeLine("Global options");
  writeLine("  -h, --help      Show this message");
  writeLine("  -V, --version   Print CLI version");
  writeLine("  help            Same as --help");
}

async function readOwnedPathsDocument(cwd: string): Promise<OwnedPathsDocument> {
  const ownedPathsPath = path.join(cwd, defaultWorkspaceKitPaths.ownedPaths);
  let parsed: unknown;

  try {
    parsed = await parseJsonFile(ownedPathsPath);
  } catch {
    return {
      schemaVersion: 1,
      ownedPaths: currentOwnedPaths,
      notes: "Owned path policy fallback generated by workspace-kit upgrade."
    };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      schemaVersion: 1,
      ownedPaths: currentOwnedPaths,
      notes: "Owned path policy fallback generated by workspace-kit upgrade."
    };
  }

  const value = parsed as Record<string, unknown>;
  const ownedPaths = Array.isArray(value.ownedPaths)
    ? value.ownedPaths.filter((item): item is string => typeof item === "string")
    : [];

  return {
    schemaVersion: typeof value.schemaVersion === "number" ? value.schemaVersion : 1,
    ownedPaths: ownedPaths.length > 0 ? ownedPaths : currentOwnedPaths,
    notes: typeof value.notes === "string" ? value.notes : undefined
  };
}

async function writeFileWithBackupIfChanged(
  cwd: string,
  relativePath: string,
  content: string,
  backupRoot: string
): Promise<boolean> {
  const targetPath = path.join(cwd, relativePath);
  let existingContent: string | undefined;

  try {
    existingContent = await fs.readFile(targetPath, "utf8");
  } catch {
    existingContent = undefined;
  }

  if (existingContent === content) {
    return false;
  }

  if (typeof existingContent === "string") {
    const backupPath = path.join(backupRoot, `${relativePath}.bak`);
    await fs.mkdir(path.dirname(backupPath), { recursive: true });
    await fs.writeFile(backupPath, existingContent, "utf8");
  }

  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, content, "utf8");
  return true;
}

export async function runCli(
  args: string[],
  options: WorkspaceKitCliOptions = {}
): Promise<number> {
  const cwd = options.cwd ?? process.cwd();
  loadWorkspaceDotenv(cwd);
  const writeLine = options.writeLine ?? console.log;
  const writeError = options.writeError ?? console.error;
  const readStdinLine = options.readStdinLine;
  const [command] = args;

  if (command === "--version" || command === "-V") {
    const v = await readCliBundledPackageVersion();
    writeLine(v ?? "workspace-kit (version unknown)");
    return EXIT_SUCCESS;
  }

  if (command === "--help" || command === "-h" || command === "help") {
    await printWorkspaceKitTopLevelHelp(writeLine);
    return EXIT_SUCCESS;
  }

  if (!command) {
    await printWorkspaceKitTopLevelHelp(writeLine);
    writeError("Missing command. Re-run with a top-level command, or pass --help for the same guide.");
    return EXIT_USAGE_ERROR;
  }

  if (command === "config") {
    return runWorkspaceConfigCli(cwd, args.slice(1), { writeLine, writeError });
  }

  if (command === "init") {
    const approval = await requireCliPolicyApproval(cwd, "cli.init", "init", writeError);
    if (!approval) {
      return EXIT_VALIDATION_FAILURE;
    }

    const { errors, profile } = await validateProfile(cwd);
    if (errors.length > 0 || !profile) {
      await recordCliPolicySuccess(cwd, "cli.init", "init", approval.rationale, false);
      writeError("workspace-kit init failed profile validation.");
      for (const error of errors) {
        writeError(`- ${error}`);
      }
      return EXIT_VALIDATION_FAILURE;
    }

    const artifacts = await generateProfileDrivenArtifacts(cwd, profile);
    writeLine("workspace-kit init generated profile-driven project context artifacts.");
    writeLine(`- ${path.relative(cwd, artifacts.generatedJsonPath)}`);
    writeLine(`- ${path.relative(cwd, artifacts.generatedRulePath)}`);
    await recordCliPolicySuccess(cwd, "cli.init", "init", approval.rationale, true);
    return EXIT_SUCCESS;
  }

  if (command === "check") {
    const { errors } = await validateProfile(cwd);
    if (errors.length > 0) {
      writeError("workspace-kit check failed profile validation.");
      for (const error of errors) {
        writeError(`- ${error}`);
      }
      return EXIT_VALIDATION_FAILURE;
    }

    writeLine("workspace-kit check passed.");
    writeLine("Profile validation succeeded for required baseline fields.");
    return EXIT_SUCCESS;
  }

  if (command === "upgrade") {
    const approval = await requireCliPolicyApproval(cwd, "cli.upgrade", "upgrade", writeError);
    if (!approval) {
      return EXIT_VALIDATION_FAILURE;
    }

    const { errors, profile } = await validateProfile(cwd);
    if (errors.length > 0 || !profile) {
      await recordCliPolicySuccess(cwd, "cli.upgrade", "upgrade", approval.rationale, false);
      writeError("workspace-kit upgrade failed profile validation.");
      for (const error of errors) {
        writeError(`- ${error}`);
      }
      return EXIT_VALIDATION_FAILURE;
    }

    const ownedPathsDocument = await readOwnedPathsDocument(cwd);
    const backupRoot = path.join(cwd, ".workspace-kit", "backups", new Date().toISOString());
    const updatedPaths: string[] = [];
    const preservedPaths: string[] = [];
    const unsupportedPaths: string[] = [];

    const ownedPathSet = new Set(ownedPathsDocument.ownedPaths);
    ownedPathSet.add(defaultWorkspaceKitPaths.profile);
    ownedPathSet.add(defaultWorkspaceKitPaths.profileSchema);
    ownedPathSet.add(defaultWorkspaceKitPaths.manifest);
    ownedPathSet.add(defaultWorkspaceKitPaths.ownedPaths);
    ownedPathSet.add(".cursor/rules/workspace-kit-profile-pointer.mdc");

    const existingManifestValue = await parseJsonFile(
      path.join(cwd, defaultWorkspaceKitPaths.manifest)
    ).catch(() => ({}));
    const existingManifest =
      existingManifestValue &&
      typeof existingManifestValue === "object" &&
      !Array.isArray(existingManifestValue)
        ? (existingManifestValue as Record<string, unknown>)
        : {};

    const nowIso = new Date().toISOString();
    const resolvedKitVersion =
      (await resolvePackageVersion(cwd)) ?? (await readCliBundledPackageVersion()) ?? "0.0.0";
    const mergedManifest = {
      schemaVersion: 1,
      kit: {
        name: CANONICAL_KIT_NAME,
        version: resolvedKitVersion
      },
      installedAt:
        typeof existingManifest.installedAt === "string" && existingManifest.installedAt.length > 0
          ? existingManifest.installedAt
          : nowIso,
      lastUpgrade: nowIso,
      ownershipPolicyPath: defaultWorkspaceKitPaths.ownedPaths
    };

    const desiredAssets = new Map<string, string>([
      [defaultWorkspaceKitPaths.profileSchema, toJsonWithTrailingNewline(profileSchemaContent)],
      [defaultWorkspaceKitPaths.manifest, toJsonWithTrailingNewline(mergedManifest)],
      [
        defaultWorkspaceKitPaths.ownedPaths,
        toJsonWithTrailingNewline({
          schemaVersion: 1,
          ownedPaths: currentOwnedPaths,
          notes:
            "Phase 3 baseline: managed kit-owned paths are updated by workspace-kit upgrade with backup safety."
        })
      ],
      [".cursor/rules/workspace-kit-profile-pointer.mdc", `${pointerRuleContent}`]
    ]);

    for (const ownedPath of ownedPathSet) {
      if (ownedPath === defaultWorkspaceKitPaths.profile) {
        preservedPaths.push(ownedPath);
        continue;
      }

      const desiredContent = desiredAssets.get(ownedPath);
      if (!desiredContent) {
        if (
          ownedPath !== ".workspace-kit/generated/project-context.json" &&
          ownedPath !== ".cursor/rules/workspace-kit-project-context.mdc"
        ) {
          unsupportedPaths.push(ownedPath);
        }
        continue;
      }

      const changed = await writeFileWithBackupIfChanged(
        cwd,
        ownedPath,
        desiredContent,
        backupRoot
      );
      if (changed) {
        updatedPaths.push(ownedPath);
      }
    }

    const generatedArtifacts = await generateProfileDrivenArtifacts(cwd, profile);
    updatedPaths.push(path.relative(cwd, generatedArtifacts.generatedJsonPath));
    updatedPaths.push(path.relative(cwd, generatedArtifacts.generatedRulePath));

    writeLine("workspace-kit upgrade completed.");
    if (updatedPaths.length > 0) {
      writeLine("Updated kit-owned paths:");
      for (const updatedPath of updatedPaths) {
        writeLine(`- ${updatedPath}`);
      }
    }
    if (preservedPaths.length > 0) {
      writeLine("Preserved merge-managed paths:");
      for (const preservedPath of preservedPaths) {
        writeLine(`- ${preservedPath}`);
      }
    }
    if (unsupportedPaths.length > 0) {
      writeLine("Ignored unsupported owned paths:");
      for (const unsupportedPath of unsupportedPaths) {
        writeLine(`- ${unsupportedPath}`);
      }
    }
    writeLine(`Backups written under: ${path.relative(cwd, backupRoot)}`);
    await recordCliPolicySuccess(cwd, "cli.upgrade", "upgrade", approval.rationale, true);
    return EXIT_SUCCESS;
  }

  if (command === "drift-check") {
    const { errors, profile } = await validateProfile(cwd);
    if (errors.length > 0 || !profile) {
      writeError("workspace-kit drift-check failed profile validation.");
      for (const error of errors) {
        writeError(`- ${error}`);
      }
      return EXIT_VALIDATION_FAILURE;
    }

    const driftFindings: string[] = [];
    const warnings: string[] = [];
    const expectedAssets = createDriftExpectedAssets(profile);
    const ownedPathsDocument = await readOwnedPathsDocument(cwd);
    const ownedPathSet = new Set(ownedPathsDocument.ownedPaths);

    for (const ownedPath of ownedPathSet) {
      const expectedContent = expectedAssets.get(ownedPath);
      if (!expectedContent) {
        warnings.push(`unsupported owned path skipped: ${ownedPath}`);
        continue;
      }

      const targetPath = path.join(cwd, ownedPath);
      let existingContent: string;
      try {
        existingContent = await fs.readFile(targetPath, "utf8");
      } catch {
        driftFindings.push(`${ownedPath}: missing`);
        continue;
      }

      if (!driftContentMatches(ownedPath, existingContent, expectedContent)) {
        driftFindings.push(`${ownedPath}: content drift detected`);
      }
    }

    const manifestPath = path.join(cwd, defaultWorkspaceKitPaths.manifest);
    let manifest: Record<string, unknown> | undefined;
    try {
      const parsedManifest = await parseJsonFile(manifestPath);
      if (parsedManifest && typeof parsedManifest === "object" && !Array.isArray(parsedManifest)) {
        manifest = parsedManifest as Record<string, unknown>;
      } else {
        driftFindings.push(`${defaultWorkspaceKitPaths.manifest}: invalid structure`);
      }
    } catch {
      driftFindings.push(`${defaultWorkspaceKitPaths.manifest}: missing or invalid JSON`);
    }

    if (manifest) {
      if (manifest.ownershipPolicyPath !== defaultWorkspaceKitPaths.ownedPaths) {
        driftFindings.push(
          `${defaultWorkspaceKitPaths.manifest}: ownershipPolicyPath must equal ${defaultWorkspaceKitPaths.ownedPaths}`
        );
      }

      const manifestKit =
        manifest.kit && typeof manifest.kit === "object" && !Array.isArray(manifest.kit)
          ? (manifest.kit as Record<string, unknown>)
          : undefined;
      const manifestKitName =
        manifestKit && typeof manifestKit.name === "string" ? manifestKit.name : undefined;
      const manifestKitVersion =
        manifestKit && typeof manifestKit.version === "string" ? manifestKit.version : undefined;
      const packageVersion = await resolvePackageVersion(cwd);

      if (!manifestKitName || !manifestKitVersion) {
        driftFindings.push(
          `${defaultWorkspaceKitPaths.manifest}: kit.name and kit.version are required`
        );
      } else if (
        (manifestKitName === CANONICAL_KIT_NAME || manifestKitName === "quicktask-workspace-kit") &&
        packageVersion
      ) {
        if (manifestKitVersion !== packageVersion) {
          driftFindings.push(
            `${defaultWorkspaceKitPaths.manifest}: kit.version (${manifestKitVersion}) does not match package version (${packageVersion})`
          );
        }
      } else if (
        manifestKitName !== CANONICAL_KIT_NAME &&
        manifestKitName !== "quicktask-workspace-kit"
      ) {
        warnings.push(
          `${defaultWorkspaceKitPaths.manifest}: kit.name is '${manifestKitName}', skipping package-version drift comparison`
        );
      }
    }

    if (driftFindings.length > 0) {
      writeError("workspace-kit drift-check detected drift.");
      for (const finding of driftFindings) {
        writeError(`- ${finding}`);
      }
      for (const warning of warnings) {
        writeError(`- warning: ${warning}`);
      }
      return EXIT_VALIDATION_FAILURE;
    }

    writeLine("workspace-kit drift-check passed.");
    writeLine("No managed asset drift detected for supported owned paths.");
    for (const warning of warnings) {
      writeLine(`- warning: ${warning}`);
    }
    return EXIT_SUCCESS;
  }

  if (command === "run") {
    return handleRunCommand(
      cwd,
      args,
      { writeLine, writeError, readStdinLine },
      {
        success: EXIT_SUCCESS,
        validationFailure: EXIT_VALIDATION_FAILURE,
        usageError: EXIT_USAGE_ERROR,
        internalError: EXIT_INTERNAL_ERROR
      }
    );
  }

  if (command !== "doctor") {
    writeError(
      `Unknown command '${command}'. Supported: init, doctor, check, upgrade, drift-check, run, config. Run workspace-kit --help for a guided overview.`
    );
    return EXIT_USAGE_ERROR;
  }

  const doctorRest = args.slice(1);
  const wantAgentInstructionSurface =
    doctorRest.includes("--agent-instruction-surface") ||
    doctorRest.includes("agent-instruction-surface");

  const issues: DoctorIssue[] = [];
  const requiredPaths = Object.values(defaultWorkspaceKitPaths).map((relativePath) =>
    path.join(cwd, relativePath)
  );

  for (const requiredPath of requiredPaths) {
    try {
      await fs.access(requiredPath);
    } catch {
      issues.push({
        path: path.relative(cwd, requiredPath) || requiredPath,
        reason: "missing"
      });
      continue;
    }

    try {
      await parseJsonFile(requiredPath);
    } catch {
      issues.push({
        path: path.relative(cwd, requiredPath) || requiredPath,
        reason: "invalid-json"
      });
    }
  }

  issues.push(...(await collectDoctorPlanningPersistenceIssues(cwd)));

  if (issues.length > 0) {
    writeError("workspace-kit doctor failed validation.");
    for (const issue of issues) {
      writeError(`- ${issue.path}: ${issue.reason}`);
    }
    writeDoctorFailureRemediation(writeError, issues);
    return EXIT_VALIDATION_FAILURE;
  }

  if (wantAgentInstructionSurface) {
    try {
      const { registry } = await resolveRegistryAndConfig(cwd, defaultRegistryModules);
      const surface = buildAgentInstructionSurface(registry.getAllModules(), registry);
      writeLine(
        JSON.stringify(
          { ok: true, code: "agent-instruction-surface", data: surface },
          null,
          2
        )
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      writeError(`workspace-kit doctor: could not build agent instruction surface: ${message}`);
      writeError("  Hint: workspace-kit --help; fix config/module issues, then retry.");
      if (error instanceof ModuleRegistryError) {
        return EXIT_VALIDATION_FAILURE;
      }
      return EXIT_INTERNAL_ERROR;
    }
    return EXIT_SUCCESS;
  }

  writeLine("workspace-kit doctor passed.");
  writeLine("All canonical workspace-kit contract files are present and parseable JSON.");
  writeLine(
    "Effective workspace config resolved; task planning persistence checks passed (including SQLite when configured)."
  );
  for (const line of await collectTaskPersistenceDoctorSummaryLines(cwd)) {
    writeLine(line);
  }
  for (const line of collectPolicyLaneEnvDoctorSummaryLines()) {
    writeLine(line);
  }
  writeLine(`Next: workspace-kit run — list module commands; see ${AGENT_CLI_MAP_HUMAN_DOC} for tier/policy copy-paste.`);
  return EXIT_SUCCESS;
}

async function main(): Promise<void> {
  try {
    const code = await runCli(process.argv.slice(2));
    process.exitCode = code;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`workspace-kit internal error: ${message}`);
    process.exitCode = EXIT_INTERNAL_ERROR;
  }
}

function isCliInvokedDirectly(): boolean {
  const argvScript = process.argv[1];
  if (typeof argvScript !== "string") {
    return false;
  }
  try {
    return realpathSync(argvScript) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isCliInvokedDirectly()) {
  void main();
}

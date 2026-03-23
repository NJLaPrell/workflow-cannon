#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const EXIT_SUCCESS = 0;
const EXIT_VALIDATION_FAILURE = 1;
const EXIT_USAGE_ERROR = 2;
const EXIT_INTERNAL_ERROR = 3;

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
};

type DoctorIssue = {
  path: string;
  reason: string;
};

const allowedPackageManagers = new Set(["pnpm", "npm", "yarn"]);

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

  const generatedContext = {
    generatedFrom: defaultWorkspaceKitPaths.profile,
    projectName: profile.project.name,
    packageManager: profile.packageManager,
    commands: profile.commands,
    github: profile.github
  };

  await fs.mkdir(path.dirname(generatedJsonPath), { recursive: true });
  await fs.writeFile(
    `${generatedJsonPath}`,
    `${JSON.stringify(generatedContext, null, 2)}\n`,
    "utf8"
  );

  const ruleBody = [
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

  await fs.mkdir(path.dirname(generatedRulePath), { recursive: true });
  await fs.writeFile(generatedRulePath, `${ruleBody}\n`, "utf8");

  return { generatedJsonPath, generatedRulePath };
}

export async function runCli(
  args: string[],
  options: WorkspaceKitCliOptions = {}
): Promise<number> {
  const cwd = options.cwd ?? process.cwd();
  const writeLine = options.writeLine ?? console.log;
  const writeError = options.writeError ?? console.error;
  const [command] = args;

  if (!command) {
    writeError("Usage: workspace-kit <init|doctor|check>");
    return EXIT_USAGE_ERROR;
  }

  if (command === "init") {
    const { errors, profile } = await validateProfile(cwd);
    if (errors.length > 0 || !profile) {
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

  if (command !== "doctor") {
    writeError(`Unknown command '${command}'. Supported commands: init, doctor, check.`);
    return EXIT_USAGE_ERROR;
  }

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

  if (issues.length > 0) {
    writeError("workspace-kit doctor failed validation.");
    for (const issue of issues) {
      writeError(`- ${issue.path}: ${issue.reason}`);
    }
    return EXIT_VALIDATION_FAILURE;
  }

  writeLine("workspace-kit doctor passed.");
  writeLine("All canonical workspace-kit contract files are present and parseable JSON.");
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

const isDirectExecution =
  typeof process.argv[1] === "string" && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution) {
  void main();
}

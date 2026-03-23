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

export async function parseJsonFile(filePath: string): Promise<unknown> {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
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
    writeError("Usage: workspace-kit <init|doctor>");
    return EXIT_USAGE_ERROR;
  }

  if (command === "init") {
    writeLine("workspace-kit init scaffold placeholder complete.");
    writeLine("Next: implement asset sync and profile-driven generation in follow-up tasks.");
    return EXIT_SUCCESS;
  }

  if (command !== "doctor") {
    writeError(`Unknown command '${command}'. Supported commands: init, doctor.`);
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

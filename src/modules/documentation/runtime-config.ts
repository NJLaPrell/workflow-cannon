import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export type DocumentationRuntimeConfig = {
  aiRoot: string;
  humanRoot: string;
  templatesRoot: string;
  instructionsRoot: string;
  schemasRoot: string;
  maxValidationAttempts: number;
  sourceRoot: string;
};

export function isPathWithinRoot(path: string, root: string): boolean {
  return path === root || path.startsWith(`${root}${sep}`);
}

function parseDefaultValue(fileContent: string, key: string, fallback: string): string {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`\\\`${escaped}\\\`[^\\n]*default:\\s*\\\`([^\\\`]+)\\\``);
  const match = fileContent.match(regex);
  return match?.[1] ?? fallback;
}

export async function loadRuntimeConfig(workspacePath: string): Promise<DocumentationRuntimeConfig> {
  const runtimeSourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
  const sourceRoots = [workspacePath, runtimeSourceRoot];
  let sourceRoot = workspacePath;
  let configContent: string | undefined;
  for (const candidateRoot of sourceRoots) {
    const candidate = resolve(candidateRoot, "src/modules/documentation/config.md");
    if (!existsSync(candidate)) continue;
    configContent = await readFile(candidate, "utf8");
    sourceRoot = candidateRoot;
    break;
  }

  if (!configContent) {
    return {
      aiRoot: "/.ai",
      humanRoot: "docs/maintainers",
      templatesRoot: "src/modules/documentation/templates",
      instructionsRoot: "src/modules/documentation/instructions",
      schemasRoot: "src/modules/documentation/schemas",
      maxValidationAttempts: 3,
      sourceRoot
    };
  }

  const aiRoot = parseDefaultValue(configContent, "sources.aiRoot", "/.ai");
  const humanRoot = parseDefaultValue(configContent, "sources.humanRoot", "docs/maintainers");
  const templatesRoot = parseDefaultValue(configContent, "sources.templatesRoot", "src/modules/documentation/templates");
  const instructionsRoot = parseDefaultValue(configContent, "sources.instructionsRoot", "src/modules/documentation/instructions");
  const schemasRoot = parseDefaultValue(configContent, "sources.schemasRoot", "src/modules/documentation/schemas");
  const maxValidationAttemptsRaw = parseDefaultValue(configContent, "generation.maxValidationAttempts", "3");
  const maxValidationAttempts = Number.parseInt(maxValidationAttemptsRaw, 10);
  return {
    aiRoot,
    humanRoot,
    templatesRoot,
    instructionsRoot,
    schemasRoot,
    maxValidationAttempts: Number.isFinite(maxValidationAttempts) ? maxValidationAttempts : 3,
    sourceRoot
  };
}

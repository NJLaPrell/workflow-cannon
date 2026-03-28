import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type {
  DocumentationBatchResult,
  DocumentationConflict,
  DocumentationGenerateOptions,
  DocumentationGenerateResult,
  DocumentationValidationIssue
} from "./types.js";
import type { ModuleLifecycleContext } from "../../contracts/module-contract.js";
import { parseAiDocument } from "./parser.js";
import { normalizeDocument } from "./normalizer.js";
import { autoResolveAiSchema, validateAiSchema } from "./validator.js";

type DocumentationRuntimeConfig = {
  aiRoot: string;
  humanRoot: string;
  templatesRoot: string;
  instructionsRoot: string;
  schemasRoot: string;
  maxValidationAttempts: number;
  sourceRoot: string;
};

function isPathWithinRoot(path: string, root: string): boolean {
  return path === root || path.startsWith(`${root}${sep}`);
}

function parseDefaultValue(fileContent: string, key: string, fallback: string): string {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`\\\`${escaped}\\\`[^\\n]*default:\\s*\\\`([^\\\`]+)\\\``);
  const match = fileContent.match(regex);
  return match?.[1] ?? fallback;
}

async function loadRuntimeConfig(workspacePath: string): Promise<DocumentationRuntimeConfig> {
  const runtimeSourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
  const sourceRoots = [workspacePath, runtimeSourceRoot];
  let sourceRoot = workspacePath;
  let configContent: string | undefined;
  for (const candidateRoot of sourceRoots) {
    const candidate = resolve(candidateRoot, "src/modules/documentation/config.md");
    if (!existsSync(candidate)) {
      continue;
    }
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
  const templatesRoot = parseDefaultValue(
    configContent,
    "sources.templatesRoot",
    "src/modules/documentation/templates"
  );
  const instructionsRoot = parseDefaultValue(
    configContent,
    "sources.instructionsRoot",
    "src/modules/documentation/instructions"
  );
  const schemasRoot = parseDefaultValue(
    configContent,
    "sources.schemasRoot",
    "src/modules/documentation/schemas"
  );
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


function renderTemplate(templateContent: string): { output: string; unresolvedBlocks: boolean } {
  const output = templateContent.replace(/\{\{\{([\s\S]*?)\}\}\}/g, (_match, instructionText: string) => {
    const normalized = instructionText.trim().split("\n")[0] ?? "template instructions";
    return `Generated content based on instruction: ${normalized}`;
  });
  return {
    output,
    unresolvedBlocks: output.includes("{{{")
  };
}

function validateSectionCoverage(templateContent: string, output: string): DocumentationValidationIssue[] {
  const issues: DocumentationValidationIssue[] = [];
  const sectionRegex = /^##\s+(.+)$/gm;
  const expectedSections = [...templateContent.matchAll(sectionRegex)].map((match) => match[1]);
  for (const section of expectedSections) {
    if (!output.includes(`## ${section}`)) {
      issues.push({
        check: "section-coverage",
        message: `Missing required section: ${section}`,
        resolved: false
      });
    }
  }
  return issues;
}

function detectConflicts(aiOutput: string, humanOutput: string): DocumentationConflict[] {
  const conflicts: DocumentationConflict[] = [];
  const combined = `${aiOutput}\n${humanOutput}`;
  if (combined.includes("CONFLICT:")) {
    conflicts.push({
      source: "generated-output",
      reason: "Generated output flagged a conflict marker",
      severity: "stop"
    });
  }
  return conflicts;
}

type GenerateDocumentArgs = {
  documentType?: string;
  options?: DocumentationGenerateOptions;
};

export async function generateDocument(
  args: GenerateDocumentArgs,
  ctx: ModuleLifecycleContext
): Promise<DocumentationGenerateResult> {
  const documentType = args.documentType;
  if (!documentType) {
    return {
      ok: false,
      evidence: {
        documentType: "unknown",
        filesRead: [],
        filesWritten: [],
        filesSkipped: [],
        validationIssues: [
          {
            check: "template-resolution",
            message: "Missing required argument 'documentType'",
            resolved: false
          }
        ],
        conflicts: [],
        attemptsUsed: 0,
        timestamp: new Date().toISOString()
      }
    };
  }

  const options = args.options ?? {};
  const canOverwriteAi = options.overwriteAi ?? options.overwrite ?? true;
  const canOverwriteHuman = options.overwriteHuman ?? options.overwrite ?? true;
  const config = await loadRuntimeConfig(ctx.workspacePath);
  const filesRead: string[] = [];
  const filesWritten: string[] = [];
  const filesSkipped: string[] = [];
  const validationIssues: DocumentationValidationIssue[] = [];
  const conflicts: DocumentationConflict[] = [];

  const aiRoot = resolve(ctx.workspacePath, config.aiRoot.replace(/^\//, ""));
  const humanRoot = resolve(ctx.workspacePath, config.humanRoot.replace(/^\//, ""));
  const templatePath = resolve(config.sourceRoot, config.templatesRoot, documentType);
  const aiOutputPath = resolve(aiRoot, documentType);
  const humanOutputPath = resolve(humanRoot, documentType);

  if (!isPathWithinRoot(aiOutputPath, aiRoot) || !isPathWithinRoot(humanOutputPath, humanRoot)) {
    return {
      ok: false,
      evidence: {
        documentType,
        filesRead,
        filesWritten,
        filesSkipped,
        validationIssues: [
          {
            check: "write-boundary",
            message: "Resolved output path escapes configured output roots",
            resolved: false
          }
        ],
        conflicts,
        attemptsUsed: 0,
        timestamp: new Date().toISOString()
      }
    };
  }

  let templateContent = "";
  let templateFound = existsSync(templatePath);
  if (templateFound) {
    templateContent = await readFile(templatePath, "utf8");
    filesRead.push(templatePath);
  } else {
    validationIssues.push({
      check: "template-resolution",
      message: `Template not found for '${documentType}'`,
      resolved: Boolean(options.allowWithoutTemplate)
    });
    if (!options.allowWithoutTemplate) {
      return {
        ok: false,
        evidence: {
          documentType,
          filesRead,
          filesWritten,
          filesSkipped,
          validationIssues,
          conflicts,
          attemptsUsed: 0,
          timestamp: new Date().toISOString()
        }
      };
    }
  }

  const schemaPath = resolve(config.sourceRoot, config.schemasRoot, "documentation-schema.md");
  if (existsSync(schemaPath)) {
    filesRead.push(schemaPath);
    await readFile(schemaPath, "utf8");
  }

  function resolveExpectedDocFamily(docType: string): "rules" | "runbook" | "workbook" {
    if (docType.includes("runbooks/") || docType.startsWith("runbooks/")) return "runbook";
    if (docType.includes("workbooks/") || docType.startsWith("workbooks/")) return "workbook";
    return "rules";
  }

  const expectedDoc = resolveExpectedDocFamily(documentType);

  // Default AI output for draft generation. When AI files already exist and overwriteAi is false,
  // we validate and preserve the existing AI surface content instead of using this stub.
  let aiOutput = `meta|v=1|doc=${expectedDoc}|truth=canonical|st=draft\nproject|name=workflow-cannon|type=generated_doc|scope=${documentType}`;
  let attemptsUsed = 0;
  const maxAttempts = options.maxValidationAttempts ?? config.maxValidationAttempts;

  const strict = options.strict !== false;

  if (existsSync(aiOutputPath) && !canOverwriteAi) {
    // Preserve existing AI docs: validate them instead of validating the stub.
    // This avoids schema regressions from breaking doc regeneration when AI docs are already curated.
    aiOutput = await readFile(aiOutputPath, "utf8");
  }

  while (attemptsUsed < maxAttempts) {
    attemptsUsed += 1;
    const schemaIssues = validateAiSchema(aiOutput, {
      strict,
      workspacePath: ctx.workspacePath,
      expectedDoc,
    });
    if (schemaIssues.length === 0) {
      break;
    }
    const hasUnresolved = schemaIssues.some((i) => !i.resolved);
    validationIssues.push(...schemaIssues);
    if (!hasUnresolved) {
      // In advisory mode, schema warnings should not block generation.
      break;
    }
    aiOutput = autoResolveAiSchema(aiOutput);
  }

  const aiFinalIssues = validateAiSchema(aiOutput, {
    strict,
    workspacePath: ctx.workspacePath,
    expectedDoc,
  });
  if (aiFinalIssues.some((i) => !i.resolved)) {
    validationIssues.push(...aiFinalIssues);
    return {
      ok: false,
      evidence: {
        documentType,
        filesRead,
        filesWritten,
        filesSkipped,
        validationIssues,
        conflicts,
        attemptsUsed,
        timestamp: new Date().toISOString()
      }
    };
  }

  // Build normalized model now to keep parser/validator/normalizer wiring exercised.
  normalizeDocument(parseAiDocument(aiOutput));

  let humanOutput = `# ${documentType}\n\nGenerated without template.`;
  if (templateFound) {
    const rendered = renderTemplate(templateContent);
    humanOutput = rendered.output;
    if (rendered.unresolvedBlocks) {
      validationIssues.push({
        check: "section-coverage",
        message: "Template output still contains unresolved {{{ }}} blocks",
        resolved: false
      });
    }
    validationIssues.push(...validateSectionCoverage(templateContent, humanOutput));
  }

  conflicts.push(...detectConflicts(aiOutput, humanOutput));
  if (conflicts.some((conflict) => conflict.severity === "stop")) {
    return {
      ok: false,
      evidence: {
        documentType,
        filesRead,
        filesWritten,
        filesSkipped,
        validationIssues,
        conflicts,
        attemptsUsed,
        timestamp: new Date().toISOString()
      }
    };
  }

  const hasUnresolvedValidation = validationIssues.some((issue) => !issue.resolved);
  if (options.strict !== false && hasUnresolvedValidation) {
    return {
      ok: false,
      evidence: {
        documentType,
        filesRead,
        filesWritten,
        filesSkipped,
        validationIssues,
        conflicts,
        attemptsUsed,
        timestamp: new Date().toISOString()
      }
    };
  }

  if (!options.dryRun) {
    const aiExists = existsSync(aiOutputPath);
    const humanExists = existsSync(humanOutputPath);

    if ((!canOverwriteAi && aiExists) && (!canOverwriteHuman && humanExists)) {
      return {
        ok: false,
        evidence: {
          documentType,
          filesRead,
          filesWritten,
          filesSkipped: [aiOutputPath, humanOutputPath],
          validationIssues: [
            ...validationIssues,
            {
              check: "write-boundary",
              message: "Output exists and overwrite=false",
              resolved: false
            }
          ],
          conflicts,
          attemptsUsed,
          timestamp: new Date().toISOString()
        }
      };
    }

    await mkdir(aiRoot, { recursive: true });
    await mkdir(humanRoot, { recursive: true });
    await mkdir(dirname(aiOutputPath), { recursive: true });
    await mkdir(dirname(humanOutputPath), { recursive: true });

    if (canOverwriteAi || !aiExists) {
      await writeFile(aiOutputPath, `${aiOutput}\n`, "utf8");
      filesWritten.push(aiOutputPath);
    } else {
      filesSkipped.push(aiOutputPath);
    }
    if (canOverwriteHuman || !humanExists) {
      await writeFile(humanOutputPath, `${humanOutput}\n`, "utf8");
      filesWritten.push(humanOutputPath);
    } else {
      filesSkipped.push(humanOutputPath);
    }
  }

  return {
    ok: true,
    aiOutputPath,
    humanOutputPath,
    evidence: {
      documentType,
      filesRead,
      filesWritten,
      filesSkipped,
      validationIssues,
      conflicts,
      attemptsUsed,
      timestamp: new Date().toISOString()
    }
  };
}

type GenerateAllDocumentsArgs = {
  options?: DocumentationGenerateOptions;
};

export async function generateAllDocuments(
  args: GenerateAllDocumentsArgs,
  ctx: ModuleLifecycleContext
): Promise<DocumentationBatchResult> {
  const config = await loadRuntimeConfig(ctx.workspacePath);
  const templatesDir = resolve(config.sourceRoot, config.templatesRoot);

  async function listTemplateFiles(dir: string, baseDir: string): Promise<string[]> {
    const entries = await readdir(dir, { withFileTypes: true });
    const files: string[] = [];
    for (const entry of entries) {
      const absPath = resolve(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...(await listTemplateFiles(absPath, baseDir)));
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith(".md")) {
        continue;
      }
      const relPath = absPath.slice(baseDir.length + 1).split("\\").join("/");
      files.push(relPath);
    }
    return files;
  }

  let templateFiles: string[] = [];
  try {
    templateFiles = (await listTemplateFiles(templatesDir, templatesDir)).sort();
  } catch {
    return {
      ok: false,
      results: [],
      summary: {
        total: 0,
        succeeded: 0,
        failed: 1,
        skipped: 0,
        timestamp: new Date().toISOString()
      }
    };
  }

  const results: DocumentationGenerateResult[] = [];
  let succeeded = 0;
  let failed = 0;
  let skipped = 0;

  const batchOptions: DocumentationGenerateOptions = {
    ...args.options,
    overwriteAi: args.options?.overwriteAi ?? false,
    overwriteHuman: args.options?.overwriteHuman ?? true,
    strict: args.options?.strict ?? false,
  };

  for (const templateFile of templateFiles) {
    const result = await generateDocument(
      { documentType: templateFile, options: batchOptions },
      ctx
    );
    results.push(result);

    if (result.ok) {
      if (result.evidence.filesWritten.length > 0) {
        succeeded++;
      } else {
        skipped++;
      }
    } else {
      failed++;
    }
  }

  return {
    ok: failed === 0,
    results,
    summary: {
      total: templateFiles.length,
      succeeded,
      failed,
      skipped,
      timestamp: new Date().toISOString()
    }
  };
}

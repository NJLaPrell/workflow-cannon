import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, sep } from "node:path";
import { readdir } from "node:fs/promises";
import type {
  DocumentationBatchResult,
  DocumentationConflict,
  DocumentationGenerateOptions,
  DocumentationGenerateResult,
  DocumentationValidationIssue
} from "./types.js";
import type { ModuleLifecycleContext } from "../../contracts/module-contract.js";

type DocumentationRuntimeConfig = {
  aiRoot: string;
  humanRoot: string;
  templatesRoot: string;
  instructionsRoot: string;
  schemasRoot: string;
  maxValidationAttempts: number;
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
  const configPath = resolve(workspacePath, "src/modules/documentation/config.md");
  const configContent = await readFile(configPath, "utf8");

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
    maxValidationAttempts: Number.isFinite(maxValidationAttempts) ? maxValidationAttempts : 3
  };
}

function validateAiSchema(aiOutput: string): DocumentationValidationIssue[] {
  const issues: DocumentationValidationIssue[] = [];
  const lines = aiOutput.split("\n").filter((line) => line.trim().length > 0);
  if (!lines[0]?.startsWith("meta|v=")) {
    issues.push({
      check: "schema",
      message: "AI output must start with a meta record",
      resolved: false
    });
  }
  return issues;
}

function autoResolveAiSchema(aiOutput: string): string {
  if (aiOutput.startsWith("meta|v=")) {
    return aiOutput;
  }
  return `meta|v=1|doc=rules|truth=canonical|st=draft\n\n${aiOutput}`;
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
  const config = await loadRuntimeConfig(ctx.workspacePath);
  const filesRead: string[] = [];
  const filesWritten: string[] = [];
  const filesSkipped: string[] = [];
  const validationIssues: DocumentationValidationIssue[] = [];
  const conflicts: DocumentationConflict[] = [];

  const aiRoot = resolve(ctx.workspacePath, config.aiRoot.replace(/^\//, ""));
  const humanRoot = resolve(ctx.workspacePath, config.humanRoot.replace(/^\//, ""));
  const templatePath = resolve(ctx.workspacePath, config.templatesRoot, documentType);
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

  const schemaPath = resolve(ctx.workspacePath, config.schemasRoot, "documentation-schema.md");
  if (existsSync(schemaPath)) {
    filesRead.push(schemaPath);
    await readFile(schemaPath, "utf8");
  }

  let aiOutput = `meta|v=1|doc=rules|truth=canonical|st=draft\nproject|name=workflow-cannon|type=generated_doc|scope=${documentType}`;
  let attemptsUsed = 0;
  const maxAttempts = options.maxValidationAttempts ?? config.maxValidationAttempts;

  while (attemptsUsed < maxAttempts) {
    attemptsUsed += 1;
    const schemaIssues = validateAiSchema(aiOutput);
    if (schemaIssues.length === 0) {
      break;
    }
    validationIssues.push(...schemaIssues);
    aiOutput = autoResolveAiSchema(aiOutput);
  }

  const aiFinalIssues = validateAiSchema(aiOutput);
  if (aiFinalIssues.length > 0) {
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
    const canOverwriteAi = options.overwriteAi ?? options.overwrite ?? true;
    const canOverwriteHuman = options.overwriteHuman ?? options.overwrite ?? true;
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
  const templatesDir = resolve(ctx.workspacePath, config.templatesRoot);

  let templateFiles: string[] = [];
  try {
    const entries = await readdir(templatesDir);
    templateFiles = entries.filter((f) => f.endsWith(".md")).sort();
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

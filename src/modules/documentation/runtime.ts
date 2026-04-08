import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { DocumentationBatchResult, DocumentationConflict, DocumentationGenerateOptions, DocumentationGenerateResult, DocumentationValidationIssue } from "./types.js";
import type { ModuleLifecycleContext } from "../../contracts/module-contract.js";
import { parseAiDocument } from "./parser.js";
import { normalizeDocument } from "./normalizer.js";
import { renderDocument } from "./renderer.js";
import { autoResolveAiSchema, validateAiSchema } from "./validator.js";
import { isPathWithinRoot, loadRuntimeConfig } from "./runtime-config.js";
import {
  buildRepoRootReadmeFromMaintainerBody,
  detectConflicts,
  injectReadmeChatFeaturesFromNormalized,
  renderTemplate,
  resolveExpectedDocFamily,
  validateSectionCoverage
} from "./runtime-render-support.js";
import { runGenerateAllDocuments } from "./runtime-batch.js";
import {
  renderFeatureTaxonomyDocFromSourceRoot,
  renderRoadmapFromSourceRoot,
  type RoadmapRenderOptions
} from "./roadmap-render.js";

type GenerateDocumentArgs = { documentType?: string; options?: DocumentationGenerateOptions };

export async function generateDocument(args: GenerateDocumentArgs, ctx: ModuleLifecycleContext): Promise<DocumentationGenerateResult> {
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
  const canOverwriteRepoRootReadme = options.overwriteRepoRootReadme ?? options.overwrite ?? true;
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
  const isDataDrivenMaintainerDoc = documentType === "ROADMAP.md" || documentType === "FEATURE-TAXONOMY.md";

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
  let templateFound = false;
  if (!isDataDrivenMaintainerDoc) {
    templateFound = existsSync(templatePath);
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
  }

  const schemaPath = resolve(config.sourceRoot, config.schemasRoot, "documentation-schema.md");
  if (existsSync(schemaPath)) {
    filesRead.push(schemaPath);
    await readFile(schemaPath, "utf8");
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
  const normalized = normalizeDocument(parseAiDocument(aiOutput));
  void renderDocument(normalized, {
    id: "runtime-preview",
    version: 1,
    docType: expectedDoc,
    target: documentType,
    profile: expectedDoc === "runbook" ? "runbook" : expectedDoc === "workbook" ? "workbook" : "core",
    sections: [
      { id: "meta", source: "meta", renderer: "renderMetaSection" },
      { id: "rules", source: "rules", renderer: "renderRuleSection" }
    ]
  });

  let humanOutput = `# ${documentType}\n\nGenerated without template.`;
  if (isDataDrivenMaintainerDoc) {
    const docTaxonomyJsonOnly =
      process.env.WORKSPACE_KIT_DOC_TAXONOMY_JSON_ONLY === "1" ||
      process.env.WORKSPACE_KIT_DOC_TAXONOMY_JSON_ONLY === "true";
    const planningDbAbs = resolve(ctx.workspacePath, ".workspace-kit/tasks/workspace-kit.db");
    const roadmapRenderOpts: RoadmapRenderOptions | undefined =
      !docTaxonomyJsonOnly && existsSync(planningDbAbs)
        ? { planningDatabaseAbsolutePath: planningDbAbs }
        : undefined;
    const rendered =
      documentType === "ROADMAP.md"
        ? renderRoadmapFromSourceRoot(config.sourceRoot, roadmapRenderOpts)
        : renderFeatureTaxonomyDocFromSourceRoot(config.sourceRoot, roadmapRenderOpts);
    if (!("markdown" in rendered)) {
      for (const msg of rendered.errors) {
        validationIssues.push({
          check: "documentation-data",
          message: msg,
          resolved: false
        });
      }
    } else {
      humanOutput = rendered.markdown;
      for (const p of rendered.filesRead) {
        if (!filesRead.includes(p)) {
          filesRead.push(p);
        }
      }
    }
  } else if (templateFound) {
    const rendered = renderTemplate(templateContent);
    humanOutput = rendered.output;
    if (documentType === "README.md") {
      humanOutput = injectReadmeChatFeaturesFromNormalized(humanOutput, normalized);
    }
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
    const humanWritten = canOverwriteHuman || !humanExists;
    if (humanWritten) {
      const humanNormalized = `${humanOutput.replace(/\n+$/, "")}\n`;
      await writeFile(humanOutputPath, humanNormalized, "utf8");
      filesWritten.push(humanOutputPath);
    } else {
      filesSkipped.push(humanOutputPath);
    }

    if (documentType === "README.md" && humanWritten) {
      const repoRootReadmePath = resolve(ctx.workspacePath, "README.md");
      if (!isPathWithinRoot(repoRootReadmePath, ctx.workspacePath)) {
        return {
          ok: false,
          aiOutputPath,
          humanOutputPath,
          evidence: {
            documentType,
            filesRead,
            filesWritten,
            filesSkipped: [...filesSkipped, repoRootReadmePath],
            validationIssues: [
              ...validationIssues,
              {
                check: "write-boundary",
                message: "Resolved repo root README path escapes workspace root",
                resolved: false
              }
            ],
            conflicts,
            attemptsUsed,
            timestamp: new Date().toISOString()
          }
        };
      }
      const rootReadmeBody = buildRepoRootReadmeFromMaintainerBody(humanOutput);
      const rootExists = existsSync(repoRootReadmePath);
      if (!canOverwriteRepoRootReadme && rootExists) {
        filesSkipped.push(repoRootReadmePath);
      } else {
        await writeFile(repoRootReadmePath, rootReadmeBody.replace(/\n+$/, "") + "\n", "utf8");
        filesWritten.push(repoRootReadmePath);
      }
    }
  }

  const repoRootReadmePath =
    documentType === "README.md" ? resolve(ctx.workspacePath, "README.md") : undefined;

  return {
    ok: true,
    aiOutputPath,
    humanOutputPath,
    repoRootReadmePath: documentType === "README.md" ? repoRootReadmePath : undefined,
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

type GenerateAllDocumentsArgs = { options?: DocumentationGenerateOptions };

export async function generateAllDocuments(args: GenerateAllDocumentsArgs, ctx: ModuleLifecycleContext): Promise<DocumentationBatchResult> {
  return runGenerateAllDocuments(args, ctx, generateDocument);
}

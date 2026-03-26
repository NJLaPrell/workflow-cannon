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

type AiValidationContext = {
  strict: boolean;
  workspacePath: string;
  expectedDoc?: "rules" | "runbook" | "workbook";
};

type AiRecord = {
  type: string;
  positional: string[];
  kv: Record<string, string>;
  raw: string;
};

function parseAiRecordLine(line: string): AiRecord | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  const parts = trimmed.split("|");
  // Record format is `type|token|token...`. Ignore non-record markdown lines.
  if (parts.length < 2) return null;
  const type = parts[0] ?? "";
  if (!type) return null;
  const positional: string[] = [];
  const kv: Record<string, string> = {};
  for (const token of parts.slice(1)) {
    if (!token) continue;
    const idx = token.indexOf("=");
    if (idx >= 0) {
      const k = token.slice(0, idx).trim();
      const v = token.slice(idx + 1).trim();
      if (!k) continue;
      kv[k] = v;
    } else {
      positional.push(token);
    }
  }
  return { type, positional, kv, raw: line };
}

function isAllowedMetaDoc(doc: string): boolean {
  return (
    doc === "rules" ||
    doc === "runbook" ||
    doc === "workbook" ||
    doc === "generator" ||
    doc === "map" ||
    doc === "workflows" ||
    doc === "commands" ||
    doc === "decisions" ||
    doc === "glossary" ||
    doc === "observed" ||
    doc === "planned" ||
    doc === "checks" ||
    doc === "manifest"
  );
}

function validateAiSchema(aiOutput: string, ctx: AiValidationContext): DocumentationValidationIssue[] {
  const issues: DocumentationValidationIssue[] = [];
  const lines = aiOutput.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length === 0) {
    return [
      {
        check: "schema",
        message: "AI output is empty",
        resolved: false,
      }
    ];
  }

  const metaLine = lines[0];
  const meta = parseAiRecordLine(metaLine);
  if (!meta || meta.type !== "meta") {
    return [
      {
        check: "schema",
        message: "AI output must start with a meta record",
        resolved: false,
      }
    ];
  }

  const v = meta.kv["v"];
  const doc = meta.kv["doc"];
  const truth = meta.kv["truth"];
  const st = meta.kv["st"];

  if (v !== "1") {
    issues.push({
      check: "schema",
      message: "AI meta schemaVersion must be v=1",
      resolved: false,
    });
  }

  if (!doc || !isAllowedMetaDoc(doc)) {
    issues.push({
      check: "schema",
      message: `Unsupported meta.doc '${doc ?? ""}'`,
      resolved: false,
    });
  }

  if (!truth || truth.length === 0) {
    issues.push({
      check: "schema",
      message: "AI meta.truth is required",
      resolved: false,
    });
  }

  if (!st || st.length === 0) {
    issues.push({
      check: "schema",
      message: "AI meta.st is required",
      resolved: false,
    });
  }

  if (ctx.expectedDoc && doc && ctx.expectedDoc !== doc) {
    issues.push({
      check: "schema",
      message: `meta.doc '${doc}' does not match expected doc family for '${ctx.expectedDoc}'`,
      resolved: !ctx.strict,
    });
  }

  const requireActiveRecords = st === "active";

  const allowedTypes = new Set([
    // Global ai record families used across .ai/*.
    "project",
    "stack",
    "prio",
    "ref",
    "rule",
    "check",
    "path",
    "role",
    "has",
    "xhas",
    "deps",
    "xdeps",
    "module",
    "wf",
    "cmd",
    "decision",
    "term",
    "observed",
    "planned",
    "map",
    // Runbooks
    "runbook",
    "intent",
    "chain",
    "artifact",
    "state",
    "transition",
    "promotion",
    "rollback",
    // Workbooks
    "workbook",
    "scope",
    "command",
    "config",
    "cadence",
    "guardrail",
  ]);

  const presentByType: Record<string, boolean> = {};
  const missingRequired: string[] = [];

  for (const line of lines.slice(1)) {
    const rec = parseAiRecordLine(line);
    if (!rec) continue;
    presentByType[rec.type] = true;

    if (!allowedTypes.has(rec.type)) {
      issues.push({
        check: "schema",
        message: `Unknown AI record type '${rec.type}'`,
        resolved: !ctx.strict,
      });
      continue;
    }

    // Minimal record-level validation for current runbook/workbook families.
    if (rec.type === "ref") {
      const p = rec.kv["path"];
      const n = rec.kv["name"];
      if (!p || !n) {
        issues.push({
          check: "schema",
          message: "ref records require both 'name' and 'path'",
          resolved: !ctx.strict,
        });
      } else {
        const abs = resolve(ctx.workspacePath, p);
        const ok = existsSync(abs);
        if (!ok) {
          issues.push({
            check: "schema",
            message: `ref.path does not exist: '${p}'`,
            resolved: !ctx.strict,
          });
        }
      }
      continue;
    }

    if (rec.type === "rule") {
      const rid = rec.positional[0];
      const lvl = rec.positional[1] ?? rec.kv["lvl"];
      const directive = (() => {
        // rule lines can be either:
        // rule|RID|lvl|scope|directive|...
        // or the scope can be omitted:
        // rule|RID|lvl|directive|...
        const nonKey = rec.positional.slice(2);
        return nonKey[nonKey.length - 1];
      })();

      if (!rid || !/^R\d{3,}$/.test(rid)) {
        issues.push({
          check: "schema",
          message: "rule records require RID formatted like R### or R####",
          resolved: !ctx.strict,
        });
      }
      if (!lvl || !["must", "must_not", "should", "may"].includes(lvl)) {
        issues.push({
          check: "schema",
          message: `rule lvl is invalid: '${lvl ?? ""}'`,
          resolved: !ctx.strict,
        });
      }
      if (!directive || directive.length < 2) {
        issues.push({
          check: "schema",
          message: "rule directive cannot be empty",
          resolved: !ctx.strict,
        });
      }
      continue;
    }

    if (rec.type === "runbook") {
      if (!rec.kv["name"] || !rec.kv["scope"]) {
        issues.push({
          check: "schema",
          message: "runbook records require at least name and scope",
          resolved: !ctx.strict,
        });
      }
      continue;
    }

    if (rec.type === "workbook") {
      if (!rec.kv["name"]) {
        issues.push({
          check: "schema",
          message: "workbook records require 'name'",
          resolved: !ctx.strict,
        });
      }
      continue;
    }

    if (rec.type === "chain") {
      const step = rec.kv["step"];
      const command = rec.kv["command"];
      const expect = rec.kv["expect_exit"];
      if (!step || !command || expect === undefined) {
        issues.push({
          check: "schema",
          message: "chain records require step, command, and expect_exit",
          resolved: !ctx.strict,
        });
      }
      continue;
    }

    if (rec.type === "transition") {
      if (!rec.kv["from"] || !rec.kv["to"] || !rec.kv["requires"]) {
        issues.push({
          check: "schema",
          message: "transition records require from, to, requires",
          resolved: !ctx.strict,
        });
      }
      continue;
    }

    if (rec.type === "state") {
      if (!rec.kv["name"]) {
        issues.push({
          check: "schema",
          message: "state records require name",
          resolved: !ctx.strict,
        });
      }
      continue;
    }

    if (rec.type === "artifact") {
      if (!rec.kv["path"] || !rec.kv["schema"]) {
        issues.push({
          check: "schema",
          message: "artifact records require path and schema",
          resolved: !ctx.strict,
        });
      }
      continue;
    }

    if (rec.type === "command") {
      if (!rec.kv["name"]) {
        issues.push({
          check: "schema",
          message: "command records require name",
          resolved: !ctx.strict,
        });
      }
      continue;
    }

    if (rec.type === "config") {
      if (!rec.kv["key"]) {
        issues.push({
          check: "schema",
          message: "config records require key",
          resolved: !ctx.strict,
        });
      }
      continue;
    }
  }

  // Per-doc required record sets.
  if (requireActiveRecords) {
    if (doc === "runbook") {
      if (!presentByType["runbook"]) missingRequired.push("runbook| record");
      if (!presentByType["rule"] && !presentByType["chain"]) missingRequired.push("at least one rule| or chain| record");
    }
    if (doc === "workbook") {
      if (!presentByType["workbook"]) missingRequired.push("workbook| record");
      if (!presentByType["command"]) missingRequired.push("at least one command| record");
      if (!presentByType["config"]) missingRequired.push("at least one config| record");
    }
    if (doc === "rules") {
      if (!presentByType["rule"] && !presentByType["check"]) missingRequired.push("at least one rule| or check| record");
    }
  }

  if (missingRequired.length > 0) {
    issues.push({
      check: "schema",
      message: `Missing required AI records for doc family '${doc}': ${missingRequired.join(", ")}`,
      resolved: !ctx.strict,
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

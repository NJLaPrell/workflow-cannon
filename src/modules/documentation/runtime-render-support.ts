import type { DocumentationConflict, DocumentationValidationIssue, NormalizedDocument } from "./types.js";
import { chat_feature_guide } from "./renderer.js";

export function resolveExpectedDocFamily(docType: string): "rules" | "runbook" | "workbook" {
  if (docType.includes("runbooks/") || docType.startsWith("runbooks/")) return "runbook";
  if (docType.includes("workbooks/") || docType.startsWith("workbooks/")) return "workbook";
  return "rules";
}

const CHAT_FEATURES_MARKER = "<!--DOC_MODULE:CHAT_FEATURES-->";

/** Injects README bodies generated from `.ai/README.md` `chat_feature|` records. */
export function injectReadmeChatFeaturesFromNormalized(humanOutput: string, normalized: NormalizedDocument): string {
  if (!humanOutput.includes(CHAT_FEATURES_MARKER)) return humanOutput;
  const block = chat_feature_guide(normalized.chatFeatures);
  return humanOutput.replace(CHAT_FEATURES_MARKER, block);
}

export function renderTemplate(templateContent: string): { output: string; unresolvedBlocks: boolean } {
  const output = templateContent.replace(/\{\{\{([\s\S]*?)\}\}\}/g, (_match, instructionText: string) => {
    const normalized = instructionText.trim().split("\n")[0] ?? "template instructions";
    return `Generated content based on instruction: ${normalized}`;
  });
  return { output, unresolvedBlocks: output.includes("{{{") };
}

export function validateSectionCoverage(templateContent: string, output: string): DocumentationValidationIssue[] {
  const issues: DocumentationValidationIssue[] = [];
  const sectionRegex = /^##\s+(.+)$/gm;
  const expectedSections = [...templateContent.matchAll(sectionRegex)].map((match) => match[1]);
  for (const section of expectedSections) {
    if (!output.includes(`## ${section}`)) {
      issues.push({ check: "section-coverage", message: `Missing required section: ${section}`, resolved: false });
    }
  }
  return issues;
}

export function detectConflicts(aiOutput: string, humanOutput: string): DocumentationConflict[] {
  const conflicts: DocumentationConflict[] = [];
  if (`${aiOutput}\n${humanOutput}`.includes("CONFLICT:")) {
    conflicts.push({
      source: "generated-output",
      reason: "Generated output flagged a conflict marker",
      severity: "stop"
    });
  }
  return conflicts;
}

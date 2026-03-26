import { truncateTemplateWarning } from "./response-template-contract.js";

export type TemplateDirectiveParseResult = {
  templateId: string | null;
  warnings: string[];
};

/**
 * Resolve a template id from free-form instruction text (T263).
 * Examples: "Use the COMPLETED_TASK template", "template: compact"
 */
export function parseTemplateDirectiveFromText(text: string): TemplateDirectiveParseResult {
  const warnings: string[] = [];
  if (!text || typeof text !== "string") {
    return { templateId: null, warnings };
  }
  const s = text.trim();
  if (!s) return { templateId: null, warnings };

  const ids = new Set<string>();

  const reUseThe = /\buse\s+the\s+([A-Za-z0-9_-]+)\s+template\b/gi;
  let m: RegExpExecArray | null;
  while ((m = reUseThe.exec(s)) !== null) {
    ids.add(m[1]);
  }

  const reTemplateEq = /\btemplate\s*[:=]\s*([A-Za-z0-9_-]+)\b/gi;
  while ((m = reTemplateEq.exec(s)) !== null) {
    ids.add(m[1]);
  }

  const reBare = /\b(?:responseTemplateId|templateId)\s+is\s+([A-Za-z0-9_-]+)\b/gi;
  while ((m = reBare.exec(s)) !== null) {
    ids.add(m[1]);
  }

  if (ids.size === 0) {
    return { templateId: null, warnings };
  }
  if (ids.size > 1) {
    warnings.push(
      truncateTemplateWarning("Ambiguous template directive: multiple template ids referenced; using first match.")
    );
  }
  return { templateId: [...ids][0], warnings };
}

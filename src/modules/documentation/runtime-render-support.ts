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

/**
 * Canonical one-line agent routing notice prepended to repo-root README.md.
 * Maintainer-facing README.md (under humanRoot) omits this; see `buildRepoRootReadmeFromMaintainerBody`.
 */
export const ROOT_README_AGENT_NOTICE = [
  "AI agents: read **`./.ai/`** first (see repo-root [`AGENTS.md`](AGENTS.md), [`.ai/agent-source-of-truth-order.md`](.ai/agent-source-of-truth-order.md), [`.cursor/rules/agent-doc-routing.mdc`](.cursor/rules/agent-doc-routing.mdc)).",
  "For **conflicts between** `.ai/`, `docs/maintainers/`, `.cursor/rules/`, and code, use agent precedence in **`.ai/agent-source-of-truth-order.md`** and [`.ai/ARCHITECTURE.md`](.ai/ARCHITECTURE.md) — do not rely on this README alone.",
  "**Maintainers** use [`docs/maintainers/AGENTS.md`](docs/maintainers/AGENTS.md) as the human index.",
  ""
].join("\n\n");

/**
 * Derive GitHub-facing repo root `README.md` from the maintainer human README body:
 * strip template authoring comment, fix `title_image` path, prepend agent notice, rewrite relative links for repo root.
 */
const ROOT_AGENTS_LINK_TOKEN = "__WC_ROOT_AGENTS_MD__";

export function buildRepoRootReadmeFromMaintainerBody(maintainerMarkdown: string): string {
  let body = maintainerMarkdown.replace(/^\s*<!--[\s\S]*?-->\s*\n?/u, "");
  body = body.replace(/<img src="\.\.\/title_image\.png"/g, '<img src="title_image.png"');
  body = body.replace(/\]\(\.\.\/\.\.\/AGENTS\.md\)/g, `](${ROOT_AGENTS_LINK_TOKEN})`);
  body = body.replace(/\]\(\.\.\/\.\.\/src\//g, "](src/");
  body = body.replace(/\]\(\.\.\/\.\.\/\.cursor\//g, "](.cursor/");
  body = body.replace(/\]\(\.\.\/\.\.\/\.ai\//g, "](.ai/");
  body = body.replace(/\]\(\.\.\/LICENSE\)/g, "](LICENSE)");
  body = body.replace(/\]\(\.\.\/CONTRIBUTING\.md\)/g, "](CONTRIBUTING.md)");
  body = body.replace(/\]\(playbooks\//g, "](docs/maintainers/playbooks/");
  body = body.replace(/\]\(runbooks\//g, "](docs/maintainers/runbooks/");
  body = body.replace(/\]\(data\//g, "](docs/maintainers/data/");

  for (const name of [
    "POLICY-APPROVAL.md",
    "AGENT-CLI-MAP.md",
    "ROADMAP.md",
    "CHANGELOG.md",
    "RELEASING.md",
    "TERMS.md",
    "ARCHITECTURE.md",
    "AGENTS.md"
  ]) {
    body = body.replace(
      new RegExp(`\\]\\(${name.replaceAll(".", "\\.")}\\)`, "g"),
      `](docs/maintainers/${name})`
    );
  }

  body = body.replace(
    new RegExp(`\\]\\(${ROOT_AGENTS_LINK_TOKEN}\\)`, "g"),
    "](AGENTS.md)"
  );

  const normalized = `${ROOT_README_AGENT_NOTICE}${body.replace(/^\n+/, "")}`.replace(/\n+$/, "") + "\n";
  return normalized;
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

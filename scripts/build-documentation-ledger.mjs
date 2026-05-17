#!/usr/bin/env node
/**
 * Builds docs/maintainers/data/documentation-ledger.v1.json — grouped inventory
 * of Markdown documentation surfaces (T100195). Re-run after large doc moves.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outPath = path.join(root, "docs", "maintainers", "data", "documentation-ledger.v1.json");

const SKIP_DIR_NAMES = new Set([
  "node_modules",
  ".git",
  "dist",
  "coverage",
  ".workspace-kit",
  "artifacts",
  ".turbo",
  ".pnpm-store",
  ".pnpm",
  "__pycache__",
  ".venv"
]);

/** @param {string} rel posix-style */
function shouldSkipDir(rel) {
  const parts = rel.split("/").filter(Boolean);
  return parts.some((p) => SKIP_DIR_NAMES.has(p));
}

/** @param {string} dirAbs */
function walkMarkdownFiles(dirAbs, relBase, acc) {
  let dirents;
  try {
    dirents = fs.readdirSync(dirAbs, { withFileTypes: true });
  } catch {
    return;
  }
  for (const d of dirents) {
    const name = d.name;
    const rel = relBase ? `${relBase}/${name}` : name;
    if (d.isDirectory()) {
      if (shouldSkipDir(rel)) continue;
      walkMarkdownFiles(path.join(dirAbs, name), rel, acc);
    } else if (d.isFile() && name.endsWith(".md")) {
      acc.push(rel.split(path.sep).join("/"));
    }
  }
}

/**
 * @param {string} rel
 * @returns {string}
 */
function classifyGroup(rel) {
  if (!rel.includes("/")) return "repo-root";
  if (rel.startsWith(".ai/")) return "agent-machine-canonical";
  if (rel.startsWith("docs/maintainers/")) return "maintainer-human";
  if (rel.startsWith("docs/")) return "docs-other";
  if (rel.startsWith("src/modules/documentation/templates/")) return "documentation-module-templates";
  if (rel.startsWith("src/modules/documentation/views/")) return "documentation-module-views";
  if (rel.startsWith("src/modules/documentation/data/")) return "documentation-module-data";
  if (rel.startsWith("src/modules/") && rel.includes("/instructions/")) return "module-instructions";
  if (rel.startsWith("src/modules/") && rel.endsWith("/README.md")) return "module-readme";
  if (rel.startsWith("src/modules/")) return "module-other-md";
  if (rel.startsWith("src/")) return "src-non-module-md";
  if (rel.startsWith(".agents/")) return "agents-skills-tree";
  if (rel.startsWith(".claude/")) return "claude-skills-tree";
  if (rel.startsWith("tasks/")) return "task-prompts";
  if (rel.startsWith("examples/")) return "examples";
  if (rel.startsWith("exercises/")) return "exercises";
  if (rel.startsWith(".cursor/")) return "cursor-rules-and-commands";
  if (rel.startsWith(".github/")) return "github-automation";
  if (rel.startsWith("extensions/")) return "extensions";
  if (rel.startsWith("test/")) return "test-fixtures";
  return "other";
}

/** Root-level Markdown — explicit disposition for files that intentionally remain at repo root (T100196). */
const ROOT_FILE_DISPOSITION = {
  "README.md": {
    disposition: "keep",
    rationale: "GitHub landing; body owned by documentation module — edit `.ai/README.md` + templates.",
    lifecycle: "generated",
    audience: "both",
    canonicalSource: ".ai/README.md + src/modules/documentation/templates/README.md"
  },
  "AGENTS.md": {
    disposition: "keep",
    rationale: "Pointer entry; agents use `.ai/AGENTS.md` for precedence.",
    lifecycle: "active",
    audience: "both",
    canonicalSource: "AGENTS.md (pointer) / .ai/AGENTS.md (machine)"
  },
  "CONTRIBUTING.md": {
    disposition: "keep",
    rationale: "Contributor setup and contract for intentional root Markdown.",
    lifecycle: "active",
    audience: "maintainer",
    canonicalSource: "CONTRIBUTING.md"
  },
  "CHANGELOG.md": {
    disposition: "keep",
    rationale: "Release history; maintain with releases.",
    lifecycle: "active",
    audience: "maintainer",
    canonicalSource: "CHANGELOG.md"
  },
  "PHASE_JOURNAL.md": {
    disposition: "keep",
    rationale: "Phase journal operator contract + example workflow (tests + task planRef strings).",
    lifecycle: "active",
    audience: "maintainer",
    canonicalSource: "PHASE_JOURNAL.md"
  }
};

function buildLedger() {
  const allMd = [];
  walkMarkdownFiles(root, "", allMd);

  const byGroup = new Map();
  for (const rel of allMd) {
    const g = classifyGroup(rel);
    if (!byGroup.has(g)) byGroup.set(g, []);
    byGroup.get(g).push(rel);
  }

  const groupMeta = {
    "repo-root": {
      audience: "mixed",
      generated: "partial",
      lifecycle: "active",
      canonicalSource: "per-file (see rootMarkdownFiles)",
      dispositionDefault: "keep",
      notes: "Root *.md limited to intentional entry points (README, AGENTS, CONTRIBUTING, CHANGELOG, PHASE_JOURNAL); historical planning lives under docs/maintainers/archive/repo-root-planning/."
    },
    "agent-machine-canonical": {
      audience: "agent",
      generated: "partial",
      lifecycle: "active",
      canonicalSource: ".ai/** (edit sources; some files generated by documentation module)",
      dispositionDefault: "keep",
      notes: "Machine-oriented canon per agent-doc-routing."
    },
    "maintainer-human": {
      audience: "maintainer",
      generated: "partial",
      lifecycle: "active",
      canonicalSource: "docs/maintainers/** (mirrored subsets from .ai per ADR-ai-canonical-maintainer-docs-pipeline)",
      dispositionDefault: "keep",
      notes: "Human-first maintainer prose; run generate-maintainer-docs-from-ai when pipeline-covered."
    },
    "docs-other": {
      audience: "mixed",
      generated: "no",
      lifecycle: "active",
      canonicalSource: "path-local",
      dispositionDefault: "review",
      notes: "Markdown under docs/ outside docs/maintainers — rare; classify if added."
    },
    "documentation-module-templates": {
      audience: "both",
      generated: "no",
      lifecycle: "active",
      canonicalSource: "src/modules/documentation/templates/**",
      dispositionDefault: "keep",
      notes: "Owned by documentation module; drives generate-document outputs."
    },
    "documentation-module-views": {
      audience: "machine",
      generated: "no",
      lifecycle: "active",
      canonicalSource: "src/modules/documentation/views/**",
      dispositionDefault: "keep",
      notes: "Structured views consumed by documentation module."
    },
    "documentation-module-data": {
      audience: "machine",
      generated: "partial",
      lifecycle: "active",
      canonicalSource: "src/modules/documentation/data/**",
      dispositionDefault: "keep",
      notes: "JSON inputs for generated maintainer markdown."
    },
    "module-instructions": {
      audience: "agent",
      generated: "no",
      lifecycle: "active",
      canonicalSource: "src/modules/*/instructions/*.md",
      dispositionDefault: "keep",
      notes: "Command payload shapes for workspace-kit run."
    },
    "module-readme": {
      audience: "maintainer",
      generated: "no",
      lifecycle: "active",
      canonicalSource: "per-module README.md",
      dispositionDefault: "keep",
      notes: "Module orientation; not agent bootstrap path."
    },
    "module-other-md": {
      audience: "mixed",
      generated: "no",
      lifecycle: "active",
      canonicalSource: "path-local",
      dispositionDefault: "keep",
      notes: "Module config.md, RULES.md, etc."
    },
    "src-non-module-md": {
      audience: "maintainer",
      generated: "no",
      lifecycle: "active",
      canonicalSource: "src/** (outside src/modules/)",
      dispositionDefault: "keep",
      notes: "Top-level src markdown (e.g. src/README.md)."
    },
    "task-prompts": {
      audience: "maintainer",
      generated: "no",
      lifecycle: "active",
      canonicalSource: "tasks/**",
      dispositionDefault: "keep",
      notes: "Prompt-only; does not execute workspace-kit."
    },
    "examples": {
      audience: "maintainer",
      generated: "no",
      lifecycle: "active",
      canonicalSource: "examples/**",
      dispositionDefault: "keep",
      notes: "Illustrative material."
    },
    "exercises": {
      audience: "maintainer",
      generated: "no",
      lifecycle: "active",
      canonicalSource: "exercises/**",
      dispositionDefault: "keep",
      notes: "Training / drill material."
    },
    "cursor-rules-and-commands": {
      audience: "both",
      generated: "no",
      lifecycle: "active",
      canonicalSource: ".cursor/**",
      dispositionDefault: "keep",
      notes: "Cursor enforcement and slash payloads."
    },
    "agents-skills-tree": {
      audience: "agent",
      generated: "no",
      lifecycle: "active",
      canonicalSource: ".agents/**",
      dispositionDefault: "keep",
      notes: "Agent skill stubs / mirrors (non-canonical vs .cursor/skills unless adopted)."
    },
    "claude-skills-tree": {
      audience: "maintainer",
      generated: "no",
      lifecycle: "active",
      canonicalSource: ".claude/**",
      dispositionDefault: "keep",
      notes: "Claude Code dual-install samples; see sample-wc-skill."
    },
    "github-automation": {
      audience: "maintainer",
      generated: "no",
      lifecycle: "active",
      canonicalSource: ".github/**",
      dispositionDefault: "keep",
      notes: "CI and GitHub-facing instructions."
    },
    "extensions": {
      audience: "maintainer",
      generated: "no",
      lifecycle: "active",
      canonicalSource: "extensions/**",
      dispositionDefault: "keep",
      notes: "Cursor extension subtree."
    },
    "test-fixtures": {
      audience: "machine",
      generated: "no",
      lifecycle: "active",
      canonicalSource: "test/**",
      dispositionDefault: "keep",
      notes: "Harness fixtures — not maintainer reading path."
    },
    other: {
      audience: "mixed",
      generated: "no",
      lifecycle: "active",
      canonicalSource: "path-local",
      dispositionDefault: "review",
      notes: "Catch-all for uncategorized paths — tighten mapping if this bucket grows."
    }
  };

  const groups = [];
  for (const [id, files] of [...byGroup.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const meta = groupMeta[id] ?? groupMeta.other;
    files.sort((x, y) => x.localeCompare(y));
    groups.push({
      id,
      fileCount: files.length,
      samplePaths: files.slice(0, 12),
      audience: meta.audience,
      lifecycle: meta.lifecycle,
      generated: meta.generated,
      canonicalSource: meta.canonicalSource,
      dispositionDefault: meta.dispositionDefault,
      notes: meta.notes
    });
  }

  const rootFiles = (byGroup.get("repo-root") ?? []).filter((p) => !p.includes("/"));
  const rootMarkdownFiles = rootFiles.map((name) => {
    const known = ROOT_FILE_DISPOSITION[name];
    if (known) {
      return { path: name, ...known };
    }
    return {
      path: name,
      disposition: "review",
      rationale: "Unclassified root Markdown — assign lifecycle + owner in a follow-up edit to this ledger map.",
      lifecycle: "active",
      audience: "maintainer",
      canonicalSource: name
    };
  });
  rootMarkdownFiles.sort((a, b) => a.path.localeCompare(b.path));

  return {
    schemaVersion: 1,
    title: "Workflow Cannon documentation surface ledger",
    generatedAt: new Date().toISOString(),
    generator: "scripts/build-documentation-ledger.mjs",
    repository: "workflow-cannon",
    summary: {
      totalMarkdownFiles: allMd.length,
      groupCount: groups.length
    },
    groups,
    rootMarkdownFiles,
    policyRefs: [
      "docs/maintainers/DOCUMENTATION-LIFECYCLE.md",
      ".cursor/rules/agent-doc-routing.mdc",
      "docs/maintainers/adrs/ADR-ai-canonical-maintainer-docs-pipeline.md"
    ]
  };
}

const ledger = buildLedger();
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
console.log(`Wrote ${path.relative(root, outPath)} (${ledger.summary.totalMarkdownFiles} markdown files, ${ledger.summary.groupCount} groups).`);

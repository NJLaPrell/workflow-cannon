import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const MANIFEST_PATH = path.join(ROOT, "src/contracts/builtin-run-command-manifest.json");
const CLI_MAP_PATH = path.join(ROOT, "docs/maintainers/AGENT-CLI-MAP.md");
const AI_CLI_MAP_PATH = path.join(ROOT, ".ai/AGENT-CLI-MAP.md");
const EXCLUSIONS_PATH = path.join(ROOT, "docs/maintainers/data/agent-cli-map-exclusions.json");
const SNIPPET_INDEX_PATH = path.join(ROOT, ".ai/agent-cli-snippets/INDEX.json");

function fail(message) {
  console.error(`[check-agent-cli-map-coverage] ${message}`);
  process.exit(1);
}

function loadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    fail(`Unable to parse JSON at ${filePath}: ${error.message}`);
  }
}

function collectSnippetIndexCommandNames(indexPath) {
  const names = new Set();
  if (!fs.existsSync(indexPath)) {
    return names;
  }
  try {
    const doc = JSON.parse(fs.readFileSync(indexPath, "utf8"));
    if (!Array.isArray(doc?.commands)) {
      return names;
    }
    for (const row of doc.commands) {
      if (typeof row?.name === "string" && row.name.trim()) {
        names.add(row.name.trim());
      }
    }
  } catch {
    return names;
  }
  return names;
}

function collectRunCommandsFromManifest() {
  const manifest = loadJson(MANIFEST_PATH);
  if (!Array.isArray(manifest) || manifest.length === 0) {
    fail("builtin-run-command-manifest.json must be a non-empty array.");
  }
  const commands = new Set();
  for (const row of manifest) {
    if (typeof row.name === "string" && row.name.trim()) {
      commands.add(row.name.trim());
    }
  }
  if (commands.size === 0) {
    fail("No run commands discovered from builtin-run-command-manifest.json.");
  }
  return commands;
}

function collectDocumentedCommands(...mapPaths) {
  const commands = new Set();
  for (const mapPath of mapPaths) {
    if (!fs.existsSync(mapPath)) continue;
    const source = fs.readFileSync(mapPath, "utf8");
    for (const match of source.matchAll(/(?:workspace-kit|pnpm exec wk) run ([a-z0-9-]+)/g)) {
      commands.add(match[1]);
    }
  }
  return commands;
}

const runCommands = collectRunCommandsFromManifest();
const documented = collectDocumentedCommands(CLI_MAP_PATH, AI_CLI_MAP_PATH);
const fromSnippetIndex = collectSnippetIndexCommandNames(SNIPPET_INDEX_PATH);
const documentedUnion = new Set([...documented, ...fromSnippetIndex]);
const exclusionsDoc = loadJson(EXCLUSIONS_PATH);
const excluded = new Set(
  Array.isArray(exclusionsDoc?.excludedRunCommands) ? exclusionsDoc.excludedRunCommands : []
);

const undocumented = [...runCommands]
  .filter((cmd) => !documentedUnion.has(cmd) && !excluded.has(cmd))
  .sort();
const staleExclusions = [...excluded].filter((cmd) => !runCommands.has(cmd)).sort();

if (undocumented.length > 0) {
  fail(
    `Run command(s) missing from AGENT-CLI-MAP (.ai or docs/maintainers) and exclusions: ${undocumented.join(
      ", "
    )}. Update docs/maintainers/AGENT-CLI-MAP.md or docs/maintainers/data/agent-cli-map-exclusions.json.`
  );
}

if (staleExclusions.length > 0) {
  fail(
    `Exclusion list includes unknown run command(s): ${staleExclusions.join(
      ", "
    )}. Remove stale entries from docs/maintainers/data/agent-cli-map-exclusions.json.`
  );
}

console.log(
  `[check-agent-cli-map-coverage] OK: ${documentedUnion.size} documented run commands (${documented.size} map lines + ${fromSnippetIndex.size} snippet index), ${excluded.size} exclusions, ${runCommands.size} discovered.`
);

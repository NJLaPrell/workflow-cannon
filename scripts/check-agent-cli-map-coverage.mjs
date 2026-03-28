import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const MODULES_DIR = path.join(ROOT, "src/modules");
const CLI_MAP_PATH = path.join(ROOT, "docs/maintainers/AGENT-CLI-MAP.md");
const EXCLUSIONS_PATH = path.join(ROOT, "docs/maintainers/data/agent-cli-map-exclusions.json");

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

function collectRunCommandsFromModules() {
  const commands = new Set();
  const moduleDirs = fs
    .readdirSync(MODULES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  for (const moduleDir of moduleDirs) {
    const indexPath = path.join(MODULES_DIR, moduleDir, "index.ts");
    if (!fs.existsSync(indexPath)) continue;
    const source = fs.readFileSync(indexPath, "utf8");
    for (const match of source.matchAll(/name:\s*"([a-z0-9-]+)"/g)) {
      commands.add(match[1]);
    }
  }

  if (commands.size === 0) {
    fail("No run commands discovered from module index files.");
  }
  return commands;
}

function collectDocumentedCommands(mapPath) {
  const source = fs.readFileSync(mapPath, "utf8");
  const commands = new Set();
  for (const match of source.matchAll(/workspace-kit run ([a-z0-9-]+)/g)) {
    commands.add(match[1]);
  }
  return commands;
}

const runCommands = collectRunCommandsFromModules();
const documented = collectDocumentedCommands(CLI_MAP_PATH);
const exclusionsDoc = loadJson(EXCLUSIONS_PATH);
const excluded = new Set(
  Array.isArray(exclusionsDoc?.excludedRunCommands) ? exclusionsDoc.excludedRunCommands : []
);

const undocumented = [...runCommands]
  .filter((cmd) => !documented.has(cmd) && !excluded.has(cmd))
  .sort();
const staleExclusions = [...excluded].filter((cmd) => !runCommands.has(cmd)).sort();

if (undocumented.length > 0) {
  fail(
    `Run command(s) missing from AGENT-CLI-MAP and exclusions: ${undocumented.join(
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
  `[check-agent-cli-map-coverage] OK: ${documented.size} documented run commands, ${excluded.size} exclusions, ${runCommands.size} discovered.`
);

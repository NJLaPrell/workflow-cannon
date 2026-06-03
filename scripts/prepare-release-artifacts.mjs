import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

function fail(code, message, details = {}) {
  return { ok: false, code, message, details };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replaceSingle(content, pattern, replacementFactory, metadata) {
  const matches = [...content.matchAll(pattern)];
  if (matches.length !== 1) {
    return fail("ambiguous-edit", `${metadata.path}: expected exactly one ${metadata.description} match`, metadata);
  }
  const match = matches[0];
  const oldText = match[0];
  const newText = replacementFactory(match);
  if (oldText === newText) {
    return {
      ok: true,
      content,
      changed: false,
      replacement: {
        description: metadata.description,
        oldText,
        newText
      }
    };
  }
  return {
    ok: true,
    content: content.slice(0, match.index) + newText + content.slice(match.index + oldText.length),
    changed: true,
    replacement: {
      description: metadata.description,
      oldText,
      newText
    }
  };
}

function ensureNoExistingVersionHeading(content, version, filePath) {
  const versionHeading = new RegExp(`^## \\[${escapeRegExp(version)}\\](?:\\s+-\\s+.+)?$`, "m");
  if (versionHeading.test(content)) {
    return fail(
      "release-heading-already-present",
      `${filePath}: release heading for ${version} already exists; refusing to prepare artifacts twice`,
      { path: filePath, version }
    );
  }
  return { ok: true };
}

function findSectionBounds(content, heading, filePath) {
  const headingPattern = /^## \[[^\]]+\](?:\s+-\s+.+)?$/gm;
  const headings = [...content.matchAll(headingPattern)];
  const targetPattern = new RegExp(`^${escapeRegExp(heading)}$`, "gm");
  const matching = [...content.matchAll(targetPattern)];
  if (matching.length !== 1) {
    return fail("ambiguous-changelog-section", `${filePath}: expected exactly one '${heading}' heading`, {
      path: filePath,
      heading,
      count: matching.length
    });
  }
  const current = matching[0];
  const currentIndex = headings.findIndex((entry) => entry.index === current.index);
  const nextHeadingStart = headings[currentIndex + 1]?.index ?? content.length;
  return {
    ok: true,
    headingStart: current.index,
    bodyStart: current.index + current[0].length,
    nextHeadingStart
  };
}

function trimSectionBody(body) {
  return body.replace(/^\n+/, "").replace(/\n+$/, "");
}

function buildRootChangelogSection(version, date) {
  return `## [${version}] - ${date}\n\n- See \`docs/maintainers/CHANGELOG.md\` for release notes, migration notes, and historical entries.\n\n`;
}

function updateRootChangelog(content, version, date, filePath) {
  const versionCheck = ensureNoExistingVersionHeading(content, version, filePath);
  if (!versionCheck.ok) {
    return versionCheck;
  }
  const bounds = findSectionBounds(content, "## [Unreleased]", filePath);
  if (!bounds.ok) {
    return bounds;
  }
  const insertion = buildRootChangelogSection(version, date);
  return {
    ok: true,
    content: content.slice(0, bounds.nextHeadingStart) + insertion + content.slice(bounds.nextHeadingStart),
    changed: true,
    replacement: {
      description: "insert root changelog release pointer",
      oldText: "",
      newText: insertion
    }
  };
}

function updateMaintainerChangelog(content, version, date, filePath) {
  const versionCheck = ensureNoExistingVersionHeading(content, version, filePath);
  if (!versionCheck.ok) {
    return versionCheck;
  }
  const bounds = findSectionBounds(content, "## [Unreleased]", filePath);
  if (!bounds.ok) {
    return bounds;
  }
  const body = content.slice(bounds.bodyStart, bounds.nextHeadingStart);
  const preservedBody = trimSectionBody(body);
  const releasedSection = preservedBody
    ? `## [${version}] - ${date}\n\n${preservedBody}\n\n`
    : `## [${version}] - ${date}\n\n`;
  const oldText = content.slice(bounds.bodyStart, bounds.nextHeadingStart);
  return {
    ok: true,
    content: content.slice(0, bounds.bodyStart) + "\n\n" + releasedSection + content.slice(bounds.nextHeadingStart),
    changed: true,
    replacement: {
      description: "roll maintainer changelog unreleased notes into a release section",
      oldText,
      newText: "\n\n" + releasedSection
    }
  };
}

function buildPlan(workspacePath, version, date) {
  const paths = {
    packageJson: path.join(workspacePath, "package.json"),
    rootChangelog: path.join(workspacePath, "CHANGELOG.md"),
    maintainerChangelog: path.join(workspacePath, "docs", "maintainers", "CHANGELOG.md"),
    contractsSchema: path.join(workspacePath, "schemas", "task-engine-run-contracts.schema.json"),
    pilotSnapshot: path.join(workspacePath, "schemas", "pilot-run-args.snapshot.json")
  };
  const files = [
    { path: paths.packageJson, relPath: "package.json", updater: updatePackageJson },
    { path: paths.rootChangelog, relPath: "CHANGELOG.md", updater: (content) => updateRootChangelog(content, version, date, "CHANGELOG.md") },
    {
      path: paths.maintainerChangelog,
      relPath: "docs/maintainers/CHANGELOG.md",
      updater: (content) => updateMaintainerChangelog(content, version, date, "docs/maintainers/CHANGELOG.md")
    },
    {
      path: paths.contractsSchema,
      relPath: "schemas/task-engine-run-contracts.schema.json",
      updater: updateContractsSchema
    },
    {
      path: paths.pilotSnapshot,
      relPath: "schemas/pilot-run-args.snapshot.json",
      updater: updatePilotSnapshot
    }
  ];

  const changes = [];
  const writes = [];
  for (const file of files) {
    const original = readFileSync(file.path, "utf8");
    const result = file.updater(original, version, file.relPath);
    if (!result.ok) {
      return result;
    }
    if (result.changed) {
      changes.push({
        path: file.relPath,
        replacements: [result.replacement]
      });
      writes.push({ path: file.path, content: result.content });
    }
  }
  return { ok: true, changes, writes };
}

function updatePackageJson(content, version, filePath) {
  return replaceSingle(
    content,
    /"version":\s*"([^"]+)"/g,
    () => `"version": "${version}"`,
    { path: filePath, description: "package version field" }
  );
}

function updateContractsSchema(content, version, filePath) {
  return replaceSingle(
    content,
    /"packageVersion":\s*\{[\s\S]*?"const":\s*"([^"]+)"/g,
    (match) => match[0].replace(/"const":\s*"([^"]+)"/, `"const": "${version}"`),
    { path: filePath, description: "schema packageVersion const" }
  );
}

function updatePilotSnapshot(content, version, filePath) {
  return replaceSingle(
    content,
    /"sourceSchemaPackageVersion":\s*"([^"]+)"/g,
    () => `"sourceSchemaPackageVersion": "${version}"`,
    { path: filePath, description: "pilot snapshot sourceSchemaPackageVersion" }
  );
}

function parseArgs(argv) {
  const parsed = {
    workspacePath: process.cwd(),
    dryRun: false,
    version: null,
    date: null
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") {
      parsed.dryRun = true;
      continue;
    }
    if (arg === "--workspace") {
      parsed.workspacePath = path.resolve(argv[index + 1] ?? "");
      index += 1;
      continue;
    }
    if (arg === "--version") {
      parsed.version = argv[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (arg === "--date") {
      parsed.date = argv[index + 1] ?? null;
      index += 1;
      continue;
    }
    return fail("invalid-args", `Unknown argument: ${arg}`);
  }
  if (!parsed.version) {
    return fail("invalid-args", "Missing required --version <semver>");
  }
  if (!parsed.date) {
    return fail("invalid-args", "Missing required --date <YYYY-MM-DD>");
  }
  return { ok: true, args: parsed };
}

export function prepareReleaseArtifacts(args) {
  const plan = buildPlan(args.workspacePath, args.version, args.date);
  if (!plan.ok) {
    return plan;
  }
  if (!args.dryRun) {
    for (const write of plan.writes) {
      writeFileSync(write.path, write.content, "utf8");
    }
  }
  return {
    ok: true,
    code: args.dryRun ? "release-artifacts-prepared-dry-run" : "release-artifacts-prepared",
    data: {
      workspacePath: args.workspacePath,
      version: args.version,
      date: args.date,
      dryRun: args.dryRun,
      changes: plan.changes
    }
  };
}

function main() {
  const parsed = parseArgs(process.argv.slice(2));
  const result = parsed.ok ? prepareReleaseArtifacts(parsed.args) : parsed;
  const stream = result.ok ? process.stdout : process.stderr;
  stream.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) {
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
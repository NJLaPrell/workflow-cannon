#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

function assertContains(text, needle, label) {
  if (!text.includes(needle)) {
    throw new Error(`${label}: missing ${JSON.stringify(needle)}`);
  }
}

function assertOrder(text, needles, label) {
  let previous = -1;
  for (const needle of needles) {
    const index = text.indexOf(needle);
    if (index === -1) {
      throw new Error(`${label}: missing ${JSON.stringify(needle)}`);
    }
    if (index <= previous) {
      throw new Error(`${label}: expected ${JSON.stringify(needle)} after previous quick-start token`);
    }
    previous = index;
  }
}

function quickStartSection(text, label) {
  const start = text.indexOf("## Quick start");
  if (start === -1) {
    throw new Error(`${label}: missing ## Quick start`);
  }
  const nextSection = text.indexOf("## ", start + "## Quick start".length);
  return text.slice(start, nextSection === -1 ? undefined : nextSection);
}

function checkReadme(rel) {
  const section = quickStartSection(read(rel), rel);
  assertContains(section, "attach it with `init` before `doctor`", rel);
  assertOrder(
    section,
    [
      "npx workspace-kit init",
      "npx workspace-kit doctor",
      "npx workspace-kit start"
    ],
    `${rel} npm quick start`
  );
  assertOrder(
    section,
    [
      "pnpm exec wk init",
      "pnpm exec wk doctor",
      "pnpm exec wk start"
    ],
    `${rel} pnpm quick start`
  );
}

function checkCliHelpSource() {
  const cli = read("src/cli.ts");
  assertContains(cli, "Start here (attach Workflow Cannon to a repo)", "src/cli.ts help");
  assertOrder(
    cli,
    [
      "1) workspace-kit init",
      "2) workspace-kit start",
      "3) workspace-kit run get-next-actions"
    ],
    "src/cli.ts start-here help"
  );
  for (const line of [
    "  doctor          Validate kit contract files, config, and persistence checks",
    "  init            Attach Workflow Cannon (detect + baselines + SQLite + doctor)",
    "  refresh-context Regenerate profile-driven artifacts from workspace-kit.profile.json (env approval)",
    "  start           Doctor-backed status summary after attach (--json)"
  ]) {
    assertContains(cli, line, "src/cli.ts top-level command help");
  }
}

function main() {
  checkReadme("src/modules/documentation/templates/README.md");
  checkReadme("README.md");
  checkReadme("docs/maintainers/README.md");
  checkCliHelpSource();
  console.error("check-init-first-run-doc-strings: ok");
}

try {
  main();
} catch (error) {
  console.error(`check-init-first-run-doc-strings: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

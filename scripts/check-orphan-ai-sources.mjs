#!/usr/bin/env node
/**
 * Every *.md under covered .ai/ trees must appear as a source in ai-to-docs-coverage.json.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const covPath = path.join(root, "docs/maintainers/data/ai-to-docs-coverage.json");

const TREES = [path.join(root, ".ai", "workbooks"), path.join(root, ".ai", "runbooks"), path.join(root, ".ai", "playbooks")];

function walkMarkdownFiles(dir, acc) {
  if (!fs.existsSync(dir)) return acc;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walkMarkdownFiles(p, acc);
    else if (ent.isFile() && ent.name.endsWith(".md")) acc.push(p);
  }
  return acc;
}

function main() {
  const cov = JSON.parse(fs.readFileSync(covPath, "utf8"));
  const sources = new Set(
    cov.mappings.map((m) => m.source.split(path.sep).join("/")).filter(Boolean)
  );
  const orphans = [];
  for (const tree of TREES) {
    const files = walkMarkdownFiles(tree, []);
    for (const abs of files) {
      const rel = path.relative(root, abs).split(path.sep).join("/");
      if (!sources.has(rel)) orphans.push(rel);
    }
  }
  if (orphans.length) {
    console.error("check-orphan-ai-sources: unmapped .ai markdown under covered trees:");
    for (const o of orphans.sort()) console.error(`  - ${o}`);
    console.error("Fix: add each file to docs/maintainers/data/ai-to-docs-coverage.json mappings.");
    process.exit(1);
  }
  for (const s of sources) {
    const abs = path.join(root, ...s.split("/"));
    if (!fs.existsSync(abs)) {
      console.error(`check-orphan-ai-sources: coverage lists missing file: ${s}`);
      process.exit(1);
    }
  }
  console.error("check-orphan-ai-sources: ok");
}

main();

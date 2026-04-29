#!/usr/bin/env node
/**
 * Generate `.ai/TERMS.index.json` from machine-oriented `term|name=...` rows in `.ai/TERMS.md`.
 * Run from repo root: `node scripts/generate-terms-index.mjs`
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const termsPath = path.join(root, "..", ".ai", "TERMS.md");
const outPath = path.join(root, "..", ".ai", "TERMS.index.json");

const raw = await readFile(termsPath, "utf8");
const names = new Set();
for (const line of raw.split("\n")) {
  const m = /^term\|name=([^|]+)\|/.exec(line.trim());
  if (m) {
    const name = m[1].trim();
    if (!names.has(name)) {
      names.add(name);
    }
  }
}

const terms = [...names].sort((a, b) => a.localeCompare(b));
const payload = {
  schemaVersion: 1,
  source: ".ai/TERMS.md",
  generatedBy: "scripts/generate-terms-index.mjs",
  termCount: terms.length,
  terms: terms.map((name) => ({
    name,
    anchor: `#term-${name.replace(/[^a-zA-Z0-9_-]/g, "-")}`
  }))
};

await writeFile(outPath, JSON.stringify(payload, null, 2) + "\n", "utf8");
console.log(`Wrote ${outPath} (${terms.length} terms)`);

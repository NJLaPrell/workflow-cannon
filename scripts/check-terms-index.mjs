#!/usr/bin/env node
/**
 * Fail when `.ai/TERMS.index.json` is stale vs `.ai/TERMS.md` term|name rows.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const TERMS_MD = path.join(ROOT, ".ai/TERMS.md");
const INDEX = path.join(ROOT, ".ai/TERMS.index.json");

const termsRaw = fs.readFileSync(TERMS_MD, "utf8");
const names = new Set();
for (const line of termsRaw.split("\n")) {
  const m = /^term\|name=([^|]+)\|/.exec(line.trim());
  if (m) names.add(m[1].trim());
}
const sorted = [...names].sort((a, b) => a.localeCompare(b));

if (!fs.existsSync(INDEX)) {
  console.error("[check-terms-index] missing .ai/TERMS.index.json — run: node scripts/generate-terms-index.mjs");
  process.exit(1);
}

const idx = JSON.parse(fs.readFileSync(INDEX, "utf8"));
const idxNames = Array.isArray(idx.terms) ? idx.terms.map((t) => t.name) : [];
if (idxNames.length !== sorted.length || idxNames.some((n, i) => n !== sorted[i])) {
  console.error("[check-terms-index] .ai/TERMS.index.json stale vs .ai/TERMS.md — run: node scripts/generate-terms-index.mjs");
  process.exit(1);
}
console.error(`[check-terms-index] OK (${sorted.length} terms)`);

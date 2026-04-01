#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const principlesPath = path.join(root, ".ai", "PRINCIPLES.md");
const fixturePath = path.join(root, "scripts", "fixtures", "principles-rule-ids.json");

const raw = fs.readFileSync(principlesPath, "utf8");
const found = [...raw.matchAll(/rule\|id=(R\d{3})/g)].map((m) => m[1]);
const unique = [...new Set(found)].sort();

const expected = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
const expectedSorted = [...expected].sort();

const a = unique.join(",");
const b = expectedSorted.join(",");
if (a !== b) {
  console.error("check-principles-rule-snapshot: .ai/PRINCIPLES.md rule ids do not match fixture.");
  console.error("  In file: ", unique.join(", "));
  console.error("  Fixture: ", expectedSorted.join(", "));
  console.error("  Update scripts/fixtures/principles-rule-ids.json after intentional changes.");
  process.exit(1);
}

console.error("check-principles-rule-snapshot: OK (" + unique.length + " rules)");

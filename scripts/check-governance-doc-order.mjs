#!/usr/bin/env node
/**
 * Ensures .ai/agent-source-of-truth-order.md § Source-of-truth order (agents) paths stay aligned
 * with the intended agent precedence list (drift guard for T461).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const agentsPath = path.join(root, ".ai", "agent-source-of-truth-order.md");
const fixturePath = path.join(root, "scripts", "fixtures", "governance-doc-order.json");

const raw = fs.readFileSync(agentsPath, "utf8");
const start = raw.indexOf("## Source-of-truth order (agents)");
if (start < 0) {
  console.error("check-governance-doc-order: missing ## Source-of-truth order (agents)");
  process.exit(1);
}
const afterHeader = raw.slice(start);
const lines = afterHeader.split("\n");

const pathLike = /^(\.ai\/|docs\/|\.workspace-kit\/)/;
const extracted = [];
let inNumbered = false;
for (const line of lines.slice(1)) {
  if (/^\d+\.\s/.test(line)) {
    inNumbered = true;
    for (const m of line.matchAll(/`([^`]+)`/g)) {
      const p = m[1].trim();
      if (pathLike.test(p)) {
        extracted.push(p);
      }
    }
  } else if (inNumbered && line.trim() !== "") {
    break;
  }
}

const expected = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
const a = extracted.join("\n");
const b = expected.join("\n");
if (a !== b) {
  console.error("check-governance-doc-order: agent source-of-truth path order does not match fixture.");
  console.error("  Extracted:\n   ", extracted.join("\n    "));
  console.error("  Expected:\n   ", expected.join("\n    "));
  console.error("  Update scripts/fixtures/governance-doc-order.json if the precedence change is intentional.");
  process.exit(1);
}

console.error("check-governance-doc-order: OK (" + extracted.length + " paths)");

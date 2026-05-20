import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extRoot = path.join(__dirname, "..");

const FORBIDDEN = [
  /use the Config sidebar/i,
  /activity-bar Config as (?:the )?required/i,
  /managed in the .{0,40}Config.{0,20}sidebar panel/i
];

function walk(dir, acc = []) {
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, name.name);
    if (name.isDirectory()) {
      if (name.name === "node_modules" || name.name === "dist" || name.name === "test") continue;
      walk(p, acc);
    } else if (/\.(md|ts|mjs)$/.test(name.name)) {
      acc.push(p);
    }
  }
  return acc;
}

test("extension sources avoid config-via-sidebar-only operator stubs (T100390)", () => {
  const hits = [];
  for (const file of walk(path.join(extRoot, "src")).concat([path.join(extRoot, "README.md")])) {
    const text = readFileSync(file, "utf8");
    for (const re of FORBIDDEN) {
      if (re.test(text)) hits.push(`${path.relative(extRoot, file)}: ${re}`);
    }
  }
  assert.deepEqual(hits, []);
});

test("README states Dashboard Config tab is canonical", () => {
  const readme = readFileSync(path.join(extRoot, "README.md"), "utf8");
  assert.match(readme, /Dashboard → Config/);
  assert.match(readme, /canonical/i);
});

#!/usr/bin/env node
/**
 * Fail when an instructions/*.md file under src/modules/<id>/instructions is not referenced
 * by that module's index.ts as a `file: "....md"` string (declared catalog vs disk orphans).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");
const modulesDir = path.join(repoRoot, "src", "modules");

/** Instruction-adjacent markdown that is not a `workspace-kit run` subcommand catalog entry. */
const ORPHAN_CHECK_ALLOWLIST = new Set(["documentation/documentation-maintainer.md"]);

const errors = [];

for (const ent of fs.readdirSync(modulesDir, { withFileTypes: true })) {
  if (!ent.isDirectory()) continue;
  const modId = ent.name;
  const instDir = path.join(modulesDir, modId, "instructions");
  const modRoot = path.join(modulesDir, modId);
  if (!fs.existsSync(instDir)) continue;

  const tsFiles = fs
    .readdirSync(modRoot)
    .filter((f) => f.endsWith(".ts"))
    .map((f) => path.join(modRoot, f));
  if (tsFiles.length === 0) continue;

  const indexSrc = tsFiles.map((p) => fs.readFileSync(p, "utf8")).join("\n");
  const mdFiles = fs.readdirSync(instDir).filter((f) => f.endsWith(".md"));
  for (const file of mdFiles) {
    const rel = `${modId}/${file}`;
    if (ORPHAN_CHECK_ALLOWLIST.has(rel)) continue;
    const needle = `"${file}"`;
    if (!indexSrc.includes(needle)) {
      errors.push(`Orphan instruction markdown: src/modules/${modId}/instructions/${file} (not referenced in module .ts as file: ${needle})`);
    }
  }
}

if (errors.length > 0) {
  console.error("[check-orphan-instructions] FAILED\n" + errors.join("\n"));
  process.exit(1);
}
console.log("[check-orphan-instructions] OK");

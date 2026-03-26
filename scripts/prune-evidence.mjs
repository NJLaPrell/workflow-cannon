#!/usr/bin/env node

import { readdir, rm, stat } from "node:fs/promises";
import { resolve } from "node:path";

const ROOT = process.cwd();
const DIR = resolve(ROOT, ".workspace-kit");

const maxAgeDays = Number(process.env.WORKSPACE_KIT_EVIDENCE_MAX_AGE_DAYS || "30");
const apply = process.env.WORKSPACE_KIT_EVIDENCE_PRUNE_APPLY === "true";
const cutoffMs = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;

async function walk(dir) {
  const out = [];
  let entries = [];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const abs = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await walk(abs)));
    } else if (entry.isFile() && (entry.name.endsWith(".jsonl") || entry.name.endsWith(".json"))) {
      out.push(abs);
    }
  }
  return out;
}

async function main() {
  const files = await walk(DIR);
  const stale = [];
  for (const file of files) {
    const st = await stat(file);
    if (st.mtimeMs < cutoffMs) stale.push(file);
  }

  if (apply) {
    for (const file of stale) {
      await rm(file, { force: true });
    }
  }

  console.log(
    JSON.stringify(
      {
        schemaVersion: 1,
        timestamp: new Date().toISOString(),
        apply,
        maxAgeDays,
        scanned: files.length,
        stale: stale.length,
        deleted: apply ? stale.length : 0
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

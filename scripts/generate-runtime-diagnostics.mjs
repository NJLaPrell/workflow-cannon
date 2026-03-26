#!/usr/bin/env node

import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const ROOT = process.cwd();
const ARTIFACT_PATH = resolve(ROOT, "artifacts/runtime-diagnostics.json");

const EVIDENCE_FILES = [
  ".workspace-kit/policy/traces.jsonl",
  ".workspace-kit/config/mutations.jsonl",
  ".workspace-kit/approvals/decisions.jsonl",
  ".workspace-kit/lineage/events.jsonl"
];

async function safeStat(path) {
  try {
    return await stat(path);
  } catch {
    return null;
  }
}

async function countLines(path) {
  try {
    const raw = await readFile(path, "utf8");
    return raw.split("\n").filter(Boolean).length;
  } catch {
    return 0;
  }
}

async function main() {
  const files = [];
  for (const rel of EVIDENCE_FILES) {
    const abs = resolve(ROOT, rel);
    const st = await safeStat(abs);
    files.push({
      path: rel,
      exists: Boolean(st),
      sizeBytes: st?.size ?? 0,
      updatedAt: st?.mtime.toISOString() ?? null,
      records: await countLines(abs)
    });
  }

  const totalSize = files.reduce((sum, file) => sum + file.sizeBytes, 0);
  const totalRecords = files.reduce((sum, file) => sum + file.records, 0);
  const objectives = {
    maxEvidenceBytes: 5_000_000,
    maxEvidenceRecords: 200_000,
    status:
      totalSize <= 5_000_000 && totalRecords <= 200_000
        ? "healthy"
        : "needs-attention"
  };

  await mkdir(resolve(ROOT, "artifacts"), { recursive: true });
  await writeFile(
    ARTIFACT_PATH,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        files,
        totals: { sizeBytes: totalSize, records: totalRecords },
        objectives
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  console.log(`Runtime diagnostics written to ${ARTIFACT_PATH}`);
}

main();

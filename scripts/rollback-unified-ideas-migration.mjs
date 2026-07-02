#!/usr/bin/env node
/**
 * Restore WBS-6 migration snapshot (ideas SQLite + planning tree).
 * Dry-run by default; pass --commit to apply.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function usage() {
  console.error(`Usage: node scripts/rollback-unified-ideas-migration.mjs --snapshot <path> [--workspace <path>] [--commit]

  --snapshot   Snapshot directory (e.g. .workspace-kit/migration-backups/2026-07-02T09-33-16-227Z)
  --workspace  Workspace root (default: cwd)
  --commit     Apply restore (default: dry-run only)
`);
  process.exit(1);
}

function parseArgs(argv) {
  const out = { snapshot: "", workspace: process.cwd(), commit: false };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--commit") {
      out.commit = true;
      continue;
    }
    if (arg === "--snapshot") {
      out.snapshot = argv[++i] ?? "";
      continue;
    }
    if (arg === "--workspace") {
      out.workspace = argv[++i] ?? process.cwd();
      continue;
    }
    if (arg === "-h" || arg === "--help") {
      usage();
    }
    console.error(`Unknown argument: ${arg}`);
    usage();
  }
  if (!out.snapshot.trim()) {
    usage();
  }
  return out;
}

function readManifest(snapshotDir) {
  const manifestPath = path.join(snapshotDir, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`manifest.json not found in snapshot: ${snapshotPath}`);
  }
  return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
}

function planRestore(snapshotDir, workspacePath, copiedPaths) {
  const actions = [];
  for (const rel of copiedPaths) {
    if (rel === "ideas-export.json") {
      continue;
    }
    const source = path.join(snapshotDir, rel);
    const target = path.join(workspacePath, rel);
    if (!fs.existsSync(source)) {
      actions.push({ rel, source, target, status: "missing-in-snapshot" });
      continue;
    }
    actions.push({ rel, source, target, status: "ready" });
  }
  return actions;
}

function copyTree(source, target) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.cpSync(source, target, { recursive: true });
}

function main() {
  const args = parseArgs(process.argv);
  const workspacePath = path.resolve(args.workspace);
  const snapshotDir = path.isAbsolute(args.snapshot)
    ? path.resolve(args.snapshot)
    : path.resolve(workspacePath, args.snapshot);

  if (!fs.existsSync(snapshotDir)) {
    throw new Error(`Snapshot directory not found: ${snapshotDir}`);
  }

  const manifest = readManifest(snapshotDir);
  const copiedPaths = Array.isArray(manifest.copiedPaths) ? manifest.copiedPaths : [];
  const actions = planRestore(snapshotDir, workspacePath, copiedPaths);
  const ready = actions.filter((row) => row.status === "ready");
  const missing = actions.filter((row) => row.status === "missing-in-snapshot");

  const report = {
    schemaVersion: 1,
    dryRun: !args.commit,
    workspacePath,
    snapshotDir,
    manifestCreatedAt: manifest.createdAt ?? null,
    readyCount: ready.length,
    missingCount: missing.length,
    actions: actions.map(({ rel, target, status }) => ({ rel, target, status }))
  };

  if (!args.commit) {
    console.log(JSON.stringify({ ok: true, code: "unified-ideas-rollback-dry-run", data: report }, null, 2));
    return;
  }

  for (const row of ready) {
    copyTree(row.source, row.target);
  }

  const receipt = {
    ...report,
    dryRun: false,
    restoredAt: new Date().toISOString(),
    restoredPaths: ready.map((row) => row.rel)
  };
  fs.writeFileSync(
    path.join(snapshotDir, "rollback-receipt.json"),
    `${JSON.stringify(receipt, null, 2)}\n`,
    "utf8"
  );
  console.log(JSON.stringify({ ok: true, code: "unified-ideas-rollback-applied", data: receipt }, null, 2));
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(JSON.stringify({ ok: false, code: "unified-ideas-rollback-failed", message }, null, 2));
  process.exit(1);
}

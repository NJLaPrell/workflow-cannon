#!/usr/bin/env node
/**
 * Evidence bundle exporter (maintainer / audit). Allowlisted paths only; optional redaction for common token patterns.
 * Usage: node scripts/export-evidence-bundle.mjs [--dry-run] [--out artifacts/evidence-bundle.zip]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const MAX_BYTES = 50 * 1024 * 1024;
const TOKEN_RE = /\b(sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]+)\b/g;

function parseArgs(argv) {
  const dryRun = argv.includes("--dry-run");
  const outIdx = argv.indexOf("--out");
  const out =
    outIdx >= 0 && argv[outIdx + 1]
      ? path.resolve(ROOT, argv[outIdx + 1])
      : path.join(ROOT, "artifacts", `evidence-bundle-${Date.now()}.zip`);
  return { dryRun, out };
}

function allowlistedRelPaths() {
  const rel = [
    ".workspace-kit/policy/traces.jsonl",
    ".workspace-kit/tasks/workspace-kit.db",
    ".workspace-kit/tasks/state.json"
  ];
  const artifactsDir = path.join(ROOT, "artifacts");
  if (fs.existsSync(artifactsDir)) {
    for (const name of fs.readdirSync(artifactsDir)) {
      if (name.endsWith(".json") || name.endsWith(".jsonl")) {
        rel.push(path.join("artifacts", name));
      }
    }
  }
  return rel;
}

function collectFiles() {
  const files = [];
  let total = 0;
  for (const rel of allowlistedRelPaths()) {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) continue;
    const st = fs.statSync(abs);
    if (total + st.size > MAX_BYTES) continue;
    total += st.size;
    files.push(rel);
  }
  return { files, totalBytes: total };
}

function redactText(s) {
  return s.replace(TOKEN_RE, "[REDACTED]");
}

function main() {
  const { dryRun, out } = parseArgs(process.argv.slice(2));
  const { files, totalBytes } = collectFiles();
  const manifest = {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    dryRun,
    maxBytes: MAX_BYTES,
    files,
    totalBytes
  };
  if (dryRun) {
    process.stdout.write(JSON.stringify({ ok: true, manifest }, null, 2) + "\n");
    return;
  }
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const staging = fs.mkdtempSync(path.join(ROOT, "artifacts", ".evidence-staging-"));
  try {
    const manifestPath = path.join(staging, "manifest.json");
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
    for (const rel of files) {
      const abs = path.join(ROOT, rel);
      const dest = path.join(staging, rel.split(path.sep).join("_"));
      let body = fs.readFileSync(abs, "utf8");
      if (rel.endsWith(".jsonl") || rel.endsWith(".json")) {
        body = redactText(body);
      }
      fs.writeFileSync(dest, body);
    }
    const names = fs.readdirSync(staging);
    execFileSync("zip", ["-q", "-r", out, ...names], { cwd: staging, stdio: "inherit" });
    process.stdout.write(JSON.stringify({ ok: true, zip: out, manifest }, null, 2) + "\n");
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

main();

#!/usr/bin/env node

/**
 * Parity validation runner.
 *
 * Executes the canonical parity command chain against the packaged artifact
 * and emits a machine-readable evidence file to artifacts/parity-evidence.json.
 *
 * Exit 0 = all steps pass, non-zero = at least one step failed.
 */

import { execSync } from "node:child_process";
import { mkdir, writeFile, readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

const ROOT = process.cwd();
const ARTIFACTS_DIR = resolve(ROOT, "artifacts");
const EVIDENCE_PATH = resolve(ARTIFACTS_DIR, "parity-evidence.json");
const FIXTURE_DIR = resolve(ROOT, "test", "fixtures", "parity");

const steps = [
  { name: "build", command: "pnpm run build", cwd: ROOT },
  { name: "typecheck", command: "pnpm run check", cwd: ROOT },
  { name: "test", command: "pnpm run test", cwd: ROOT },
  { name: "pack-dry-run", command: "pnpm run pack:dry-run", cwd: ROOT },
  { name: "metadata-check", command: "node scripts/check-release-metadata.mjs", cwd: ROOT },
];

function runStep(step) {
  const start = Date.now();
  try {
    execSync(step.command, { cwd: step.cwd, stdio: "pipe", timeout: 120_000 });
    return { name: step.name, status: "pass", durationMs: Date.now() - start };
  } catch (err) {
    return {
      name: step.name,
      status: "fail",
      durationMs: Date.now() - start,
      error: err.stderr?.toString().slice(0, 500) || err.message
    };
  }
}

async function findTarball() {
  const packDir = resolve(ARTIFACTS_DIR, "workspace-kit-pack");
  try {
    const files = await readdir(packDir);
    const tarball = files.find((f) => f.endsWith(".tgz"));
    return tarball ? resolve(packDir, tarball) : null;
  } catch {
    return null;
  }
}

async function runFixtureSmoke(tarballPath) {
  const start = Date.now();
  try {
    // Native deps (e.g. better-sqlite3) can exceed 60s on cold CI runners; keep bounded but generous.
    execSync(`npm install --no-save "${tarballPath}"`, {
      cwd: FIXTURE_DIR,
      stdio: "pipe",
      timeout: 300_000,
    });
    execSync("npm run smoke", { cwd: FIXTURE_DIR, stdio: "pipe", timeout: 30_000 });
    return { name: "fixture-smoke", status: "pass", durationMs: Date.now() - start };
  } catch (err) {
    return {
      name: "fixture-smoke",
      status: "fail",
      durationMs: Date.now() - start,
      error: err.stderr?.toString().slice(0, 500) || err.message
    };
  }
}

async function main() {
  await mkdir(ARTIFACTS_DIR, { recursive: true });

  const results = [];
  let failed = false;

  for (const step of steps) {
    const result = runStep(step);
    results.push(result);
    if (result.status === "fail") {
      failed = true;
      break;
    }
  }

  if (!failed) {
    const tarball = await findTarball();
    if (tarball) {
      const smokeResult = await runFixtureSmoke(tarball);
      results.push(smokeResult);
      if (smokeResult.status === "fail") failed = true;
    } else {
      results.push({
        name: "fixture-smoke",
        status: "fail",
        durationMs: 0,
        error: "No tarball found in artifacts/workspace-kit-pack/"
      });
      failed = true;
    }
  }

  const evidence = {
    schemaVersion: 1,
    runner: "scripts/run-parity.mjs",
    timestamp: new Date().toISOString(),
    overall: failed ? "fail" : "pass",
    steps: results,
  };

  const schemaPath = resolve(ROOT, "schemas", "parity-evidence.schema.json");
  try {
    const schema = JSON.parse(await readFile(schemaPath, "utf8"));
    const requiredKeys = schema.required || [];
    for (const key of requiredKeys) {
      if (!(key in evidence)) {
        console.error(`Schema conformance warning: missing required key '${key}' in evidence.`);
      }
    }
  } catch {
    console.error("Warning: could not load parity evidence schema for validation.");
  }

  await writeFile(EVIDENCE_PATH, JSON.stringify(evidence, null, 2) + "\n", "utf8");
  console.log(`Parity evidence written to ${EVIDENCE_PATH}`);

  if (failed) {
    console.error("Parity validation FAILED.");
    const failedStep = results.find((r) => r.status === "fail");
    if (failedStep) {
      console.error(`  Failed at: ${failedStep.name}`);
      if (failedStep.error) console.error(`  Error: ${failedStep.error}`);
    }
    process.exit(1);
  }

  console.log("Parity validation passed.");
}

main();

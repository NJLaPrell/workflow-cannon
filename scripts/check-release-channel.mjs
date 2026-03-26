#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const ROOT = process.cwd();
const MATRIX_PATH = resolve(ROOT, "docs/maintainers/data/compatibility-matrix.json");
const PKG_PATH = resolve(ROOT, "package.json");

function hasPrerelease(version) {
  return typeof version === "string" && version.includes("-");
}

async function main() {
  const channel = (process.env.WORKSPACE_KIT_RELEASE_CHANNEL || "stable").trim();
  const failures = [];

  const [pkg, matrix] = await Promise.all([
    readFile(PKG_PATH, "utf8").then((raw) => JSON.parse(raw)),
    readFile(MATRIX_PATH, "utf8").then((raw) => JSON.parse(raw))
  ]);

  const entry = Array.isArray(matrix.channels)
    ? matrix.channels.find((c) => c.name === channel)
    : undefined;
  if (!entry) {
    console.error(`FAIL: unknown channel '${channel}'.`);
    process.exit(1);
  }

  const version = pkg.version;
  if (entry.allowPrerelease === false && hasPrerelease(version)) {
    failures.push(`channel '${channel}' does not allow prerelease version '${version}'`);
  }

  const distTag = process.env.WORKSPACE_KIT_RELEASE_DIST_TAG;
  if (distTag && distTag !== entry.npmDistTag) {
    failures.push(`dist-tag mismatch: env=${distTag} expected=${entry.npmDistTag}`);
  }

  const gitTag = process.env.WORKSPACE_KIT_RELEASE_TAG;
  if (gitTag && !gitTag.startsWith(entry.tagPrefix)) {
    failures.push(`git tag '${gitTag}' does not start with required prefix '${entry.tagPrefix}'`);
  }

  if (failures.length > 0) {
    console.error("Release channel check FAILED:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }

  console.log(
    `Release channel check passed (${channel}; npm tag ${entry.npmDistTag}; prerelease allowed=${entry.allowPrerelease}).`
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

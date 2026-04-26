#!/usr/bin/env node
/**
 * CI gate: CAE registry must validate via shipped `cae-registry-validate`.
 * When the kit SQLite DB has CAE registry tables but **no active version**, seed once from
 * default `.ai/cae/registry/*.json` (same payload shape as `cae-import-json-registry`) so
 * **`registryStore: sqlite`** checks stay green without a manual import.
 *
 * Intended to run after the TypeScript stage in `pnpm run check` so dist/*.js exists.
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(root, "dist", "cli.js");

function distUrl(rel) {
  return pathToFileURL(path.join(root, rel)).href;
}

async function ensureSqliteRegistrySeededFromJson(workspaceRoot) {
  const effective = {};
  const { openKitSqliteReadWrite, caeRegistryTablesReady, getActiveCaeRegistryVersionId } = await import(
    distUrl("dist/core/cae/cae-kit-sqlite.js")
  );
  const { loadCaeRegistry } = await import(distUrl("dist/core/cae/cae-registry-load.js"));
  const { replaceActiveCaeRegistryFromLoaded } = await import(distUrl("dist/core/cae/cae-registry-sqlite.js"));

  const db = openKitSqliteReadWrite(workspaceRoot, effective);
  if (!db) return;
  try {
    if (!caeRegistryTablesReady(db)) return;
    if (getActiveCaeRegistryVersionId(db)) return;
    const seed = loadCaeRegistry(workspaceRoot);
    if (!seed.ok) {
      throw new Error(`check-cae-registry seed: ${seed.code} ${seed.message ?? ""}`);
    }
    replaceActiveCaeRegistryFromLoaded(db, {
      versionId: "cae.reg.check-stages-seed",
      createdBy: "scripts/check-cae-registry.mjs",
      note: "Idempotent seed when no active CAE registry (Phase 70)",
      registry: seed.value
    });
  } finally {
    db.close();
  }
}

async function main() {
  if (!existsSync(cli)) {
    console.error(`check-cae-registry: missing ${cli} — run pnpm run build first.`);
    process.exit(1);
  }

  await ensureSqliteRegistrySeededFromJson(root);

  const jsonArgs = JSON.stringify({ schemaVersion: 1 });
  const res = spawnSync(process.execPath, [cli, "run", "cae-registry-validate", jsonArgs], {
    cwd: root,
    encoding: "utf8"
  });

  if (res.stdout) process.stdout.write(res.stdout);
  if (res.stderr) process.stderr.write(res.stderr);

  if (res.status !== 0) {
    console.error("check-cae-registry: workspace-kit run cae-registry-validate failed");
    process.exit(res.status ?? 1);
  }

  let parsed;
  try {
    parsed = JSON.parse(String(res.stdout ?? "").trim());
  } catch {
    console.error("check-cae-registry: could not parse CLI JSON stdout");
    process.exit(1);
  }

  if (!parsed.ok) {
    console.error("check-cae-registry: cae-registry-validate returned ok:false", parsed.code, parsed.message);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("check-cae-registry:", err);
  process.exit(1);
});

/**
 * T100795 — rollback script dry-run against local migration snapshot.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scriptPath = path.join(repoRoot, "scripts", "rollback-unified-ideas-migration.mjs");

test("rollback-unified-ideas-migration dry-runs against existing snapshot", () => {
  const backupsDir = path.join(repoRoot, ".workspace-kit", "migration-backups");
  if (!fs.existsSync(backupsDir)) {
    return;
  }
  const snapshots = fs
    .readdirSync(backupsDir)
    .map((name) => path.join(backupsDir, name))
    .filter((dir) => fs.existsSync(path.join(dir, "manifest.json")));
  if (snapshots.length === 0) {
    return;
  }
  const snapshot = snapshots.sort().at(-1);
  const out = execFileSync(
    process.execPath,
    [scriptPath, "--snapshot", snapshot, "--workspace", repoRoot],
    { encoding: "utf8" }
  );
  const parsed = JSON.parse(out);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.code, "unified-ideas-rollback-dry-run");
  assert.equal(parsed.data.dryRun, true);
  assert.ok(parsed.data.readyCount >= 0);
});

import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

test("planning consistency script passes for aligned docs", async () => {
  const { stdout } = await execFileAsync("node", ["scripts/check-planning-doc-consistency.mjs"], {
    cwd: process.cwd()
  });
  assert.match(stdout, /passed/);
});

test("prune-evidence deletes stale evidence when apply=true", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "wk-prune-"));
  const evidenceDir = path.join(workspace, ".workspace-kit", "policy");
  await mkdir(evidenceDir, { recursive: true });
  const stalePath = path.join(evidenceDir, "traces.jsonl");
  await writeFile(stalePath, '{"ok":true}\n', "utf8");

  const { stdout } = await execFileAsync("node", [path.join(process.cwd(), "scripts/prune-evidence.mjs")], {
    cwd: workspace,
    env: {
      ...process.env,
      WORKSPACE_KIT_EVIDENCE_MAX_AGE_DAYS: "0",
      WORKSPACE_KIT_EVIDENCE_PRUNE_APPLY: "true"
    }
  });
  const parsed = JSON.parse(stdout);
  assert.equal(parsed.deleted >= 1, true);

  await assert.rejects(() => readFile(stalePath, "utf8"));
});

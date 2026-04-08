import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { mkdtemp } from "node:fs/promises";

import { UnifiedStateDb } from "../dist/core/state/unified-state-db.js";

test("UnifiedStateDb ensureDb seeds kit_workspace_status from YAML when revision is 0", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "wk-unified-ws-seed-"));
  const yamlDir = path.join(workspace, "docs/maintainers/data");
  fs.mkdirSync(yamlDir, { recursive: true });
  fs.writeFileSync(
    path.join(yamlDir, "workspace-kit-status.yaml"),
    ['current_kit_phase: "71"', 'next_kit_phase: "72"', 'active_focus: "unified seed"', ""].join("\n"),
    "utf8"
  );

  const dbRel = path.join(".workspace-kit", "tasks", "unified-seed.db");
  const u = new UnifiedStateDb(workspace, dbRel);
  u.getModuleState("nonexistent-module-for-open");

  const dbPath = path.join(workspace, dbRel);
  const Database = (await import("better-sqlite3")).default;
  const db = new Database(dbPath, { readonly: true });
  try {
    const row = db
      .prepare("SELECT workspace_revision, current_kit_phase, active_focus FROM kit_workspace_status WHERE id = 1")
      .get();
    assert.equal(row.workspace_revision, 1);
    assert.equal(row.current_kit_phase, "71");
    assert.equal(row.active_focus, "unified seed");
  } finally {
    db.close();
  }
});

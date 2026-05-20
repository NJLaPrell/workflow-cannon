import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { proposeReleaseVersion } from "../dist/modules/task-engine/propose-release-version-runtime.js";

async function withPkgVersion(fn, version = "1.2.3") {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "wk-propose-ver-"));
  await fs.writeFile(
    path.join(dir, "package.json"),
    JSON.stringify({ name: "fixture", version }, null, 2)
  );
  try {
    await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

const baseTask = {
  archived: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  phaseKey: "104",
  phase: "Phase 104"
};

test("proposeReleaseVersion defaults to patch when no completed tasks", async () => {
  await withPkgVersion(async (dir) => {
    const res = proposeReleaseVersion({ workspacePath: dir, phaseKey: "104", tasks: [] });
    assert.equal(res.currentVersion, "1.2.3");
    assert.equal(res.recommended, "1.2.4");
    assert.equal(res.bump, "patch");
    assert.deepEqual(res.breakingTaskIds, []);
  });
});

test("proposeReleaseVersion recommends minor for feature changeKind", async () => {
  await withPkgVersion(async (dir) => {
    const res = proposeReleaseVersion({
      workspacePath: dir,
      phaseKey: "104",
      tasks: [
        {
          ...baseTask,
          id: "T100001",
          status: "completed",
          type: "workspace-kit",
          title: "x",
          metadata: { changeKind: "feature" }
        }
      ]
    });
    assert.equal(res.recommended, "1.3.0");
    assert.equal(res.bump, "minor");
  });
});

test("proposeReleaseVersion recommends major and lists breaking tasks", async () => {
  await withPkgVersion(async (dir) => {
    const res = proposeReleaseVersion({
      workspacePath: dir,
      phaseKey: "104",
      tasks: [
        {
          ...baseTask,
          id: "T100002",
          status: "completed",
          type: "feature",
          title: "break",
          metadata: { changeKind: "breaking" }
        },
        {
          ...baseTask,
          id: "T100003",
          status: "completed",
          type: "feature",
          title: "feat",
          metadata: { changeKind: "feature" }
        }
      ]
    });
    assert.equal(res.recommended, "2.0.0");
    assert.equal(res.bump, "major");
    assert.deepEqual(res.breakingTaskIds, ["T100002"]);
  });
});

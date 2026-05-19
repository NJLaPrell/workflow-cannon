import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  loadReleaseEvidenceFragmentsFromDir,
  mergeReleaseEvidencePartials,
  resolveReleaseEvidenceCommandArgs
} from "../dist/modules/task-engine/release-evidence-fragments.js";
import { deriveValidationsFragment } from "../dist/modules/task-engine/derive-validations-runtime.js";
import { derivePublishArtifactsFragment } from "../dist/modules/task-engine/derive-publish-artifacts-runtime.js";
import { buildReleaseEvidenceManifest } from "../dist/modules/task-engine/release-evidence-manifest.js";
import { SqliteDualPlanningStore, TaskStore, taskEngineModule } from "../dist/index.js";

async function seedSqliteStore(workspace, fn) {
  await mkdir(path.join(workspace, ".workspace-kit", "tasks"), { recursive: true });
  const dual = new SqliteDualPlanningStore(workspace, ".workspace-kit/tasks/workspace-kit.db");
  dual.loadFromDisk();
  const store = TaskStore.forSqliteDual(dual);
  await store.load();
  fn(store);
  await store.save();
}

function makeTask(overrides) {
  return {
    id: "T971",
    status: "completed",
    type: "workspace-kit",
    title: "Test",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    archived: false,
    phaseKey: "74",
    metadata: {
      deliveryEvidence: {
        schemaVersion: 1,
        branchName: "feature/T971-test",
        prUrl: "https://github.com/org/repo/pull/154",
        prNumber: 154,
        baseBranch: "release/phase-74",
        mergeSha: "abc123",
        checks: [{ name: "test", conclusion: "success" }],
        validationCommands: [{ command: "pnpm run test", exitCode: 0 }]
      }
    },
    ...overrides
  };
}

test("mergeReleaseEvidencePartials concatenates validation arrays", () => {
  const merged = mergeReleaseEvidencePartials(
    { validations: [{ command: "pnpm run check", conclusion: "success" }] },
    { validations: [{ command: "pnpm run test", conclusion: "success" }] }
  );
  assert.equal(merged.validations.length, 2);
});

test("loadReleaseEvidenceFragmentsFromDir fails on empty directory", () => {
  const result = loadReleaseEvidenceFragmentsFromDir("/no/such/dir", {
    exists: () => true,
    readdir: () => [],
    readFile: () => "{}"
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "release-evidence-fragment-dir-empty");
});

test("resolveReleaseEvidenceCommandArgs merges fragment dir and inline args", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "wk-ref-"));
  try {
    await writeFile(
      path.join(dir, "validations.json"),
      JSON.stringify({ validations: [{ command: "pnpm run check", conclusion: "success" }] }),
      "utf8"
    );
    const resolved = resolveReleaseEvidenceCommandArgs({
      workspacePath: process.cwd(),
      commandArgs: {
        merge: true,
        releaseVersion: "0.99.0",
        mergeDir: dir,
        approval: { actor: "a", timestamp: "t", rationale: "r", scope: "s" }
      },
      packageVersion: "0.99.0",
      fsImpl: {
        exists: (p) => p === dir || p.endsWith(".json"),
        readdir: () => ["validations.json"],
        readFile: (p) => {
          if (p.endsWith("validations.json")) {
            return JSON.stringify({ validations: [{ command: "pnpm run check", conclusion: "success" }] });
          }
          throw new Error("missing");
        }
      }
    });
    assert.equal(resolved.ok, true);
    assert.ok(resolved.args.validations.length >= 1);
    assert.equal(resolved.args.approval.actor, "a");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("deriveValidationsFragment uses gates output file when present", () => {
  const fragment = deriveValidationsFragment({
    phaseKey: "103",
    gatesOutputPath: "/tmp/gates.json",
    fsImpl: {
      exists: () => true,
      readFile: () =>
        JSON.stringify({
          validations: [{ command: "pnpm run pre-merge-gates", conclusion: "success", source: "saved" }]
        })
    }
  });
  assert.equal(fragment.validations.length, 1);
  assert.equal(fragment.validations[0].source, "saved");
});

test("derivePublishArtifactsFragment shape with mocked collectors", () => {
  const fragment = derivePublishArtifactsFragment({
    workspacePath: process.cwd(),
    version: "0.97.0",
    packageName: "@workflow-cannon/workspace-kit",
    collectors: {
      readGhRelease: () => ({ url: "https://github.com/example/releases/tag/v0.97.0", tagName: "v0.97.0" }),
      readNpmVersion: () => "0.97.0"
    }
  });
  assert.equal(fragment.publishArtifacts.length, 3);
  assert.equal(fragment.degraded.length, 0);
});

test("buildReleaseEvidenceManifest succeeds from merged partial args", () => {
  const result = buildReleaseEvidenceManifest({
    workspacePath: process.cwd(),
    tasks: [makeTask()],
    commandArgs: {
      phaseKey: "74",
      approval: {
        actor: "maintainer@example.com",
        timestamp: "2026-04-28T07:00:00.000Z",
        rationale: "approved",
        scope: "phase-74"
      },
      releaseNotes: { source: "json", entries: ["note"] },
      followUpScan: { scannedAt: "2026-04-28T07:00:00.000Z", rationale: "none" },
      followUpTasks: [],
      validations: [{ command: "pnpm run check", conclusion: "success" }]
    }
  });
  assert.equal(result.ok, true);
  assert.equal(result.manifest.validations.length, 1);
});

test("taskEngineModule release-evidence-manifest merge mode end-to-end", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "wk-rem-"));
  try {
    await mkdir(path.join(workspace, ".workspace-kit", "tasks"), { recursive: true });
    await mkdir(path.join(workspace, ".workspace-kit", "release-evidence", "0.77.0"), { recursive: true });
    await writeFile(
      path.join(workspace, "package.json"),
      JSON.stringify({ name: "@workflow-cannon/workspace-kit", version: "0.77.0" }),
      "utf8"
    );
    await writeFile(
      path.join(workspace, ".workspace-kit", "release-evidence", "0.77.0", "validations.json"),
      JSON.stringify({ validations: [{ command: "pnpm run check", conclusion: "success" }] }),
      "utf8"
    );

    await seedSqliteStore(workspace, (store) => {
      store.addTask(makeTask());
    });

    const result = await taskEngineModule.onCommand(
      {
        name: "release-evidence-manifest",
        args: {
          merge: true,
          releaseVersion: "0.77.0",
          phaseKey: "74",
          approval: {
            actor: "maintainer@example.com",
            timestamp: "2026-04-28T07:00:00.000Z",
            rationale: "approved",
            scope: "phase-74"
          },
          releaseNotes: { source: "json", entries: ["Phase release"] },
          followUpScan: { scannedAt: "2026-04-28T07:00:00.000Z", rationale: "none" },
          followUpTasks: []
        }
      },
      {
        workspacePath: workspace,
        effectiveConfig: {
          tasks: {
            persistenceBackend: "sqlite",
            sqliteDatabaseRelativePath: ".workspace-kit/tasks/workspace-kit.db"
          }
        }
      }
    );

    assert.equal(result.ok, true);
    assert.equal(result.data.manifest.validations.length, 1);
    assert.ok(Array.isArray(result.data.resolvedFrom));
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  verifyTaskStateLayoutOnDisk
} from "../dist/modules/task-engine/task-state-git/verify-layout.js";
import { digestTaskStateCanonicalJson } from "../dist/modules/task-engine/task-state-git/integrity.js";
import { computeManifestDigest } from "../dist/modules/task-engine/task-state-git/validate-manifest.js";
import { runTaskStateVerify } from "../dist/modules/task-engine/persistence/task-state-verify-runtime.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const validLayout = path.join(
  repoRoot,
  "src/modules/task-engine/task-state-git/fixtures/branch-layout"
);

function copyLayout(tmpDir) {
  fs.cpSync(validLayout, tmpDir, { recursive: true });
}

test("verify passes on canonical branch-layout fixture", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wk-verify-ok-"));
  copyLayout(tmp);
  const result = verifyTaskStateLayoutOnDisk(tmp);
  assert.equal(result.passed, true, JSON.stringify(result.findings));
});

test("verify catches manifest digest mismatch", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wk-verify-manifest-"));
  copyLayout(tmp);
  const manifestPath = path.join(tmp, "task-state/manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.manifestDigest = "0".repeat(64);
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const result = verifyTaskStateLayoutOnDisk(tmp);
  assert.equal(result.passed, false);
  assert.ok(result.findings.some((f) => f.code === "manifest-digest-mismatch"));
});

test("verify catches snapshot content digest mismatch", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wk-verify-snapshot-"));
  copyLayout(tmp);
  const contentPath = path.join(tmp, "task-state/snapshots/genesis.json");
  const content = JSON.parse(fs.readFileSync(contentPath, "utf8"));
  content.tasks = [{ id: "T1" }];
  fs.writeFileSync(contentPath, `${JSON.stringify(content, null, 2)}\n`);
  const result = verifyTaskStateLayoutOnDisk(tmp);
  assert.equal(result.passed, false);
  assert.ok(result.findings.some((f) => f.code === "snapshot-content-digest-mismatch"));
});

test("verify admits lifecycle tail events from a non-empty snapshot", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wk-verify-snapshot-tail-"));
  copyLayout(tmp);
  const snapshotPath = path.join(tmp, "task-state/snapshots/genesis.json");
  const snapshot = {
    schemaVersion: 1,
    projectionKind: "task-store-document",
    tasks: [
      {
        id: "T1",
        status: "ready",
        type: "execution",
        title: "Snapshot seeded task",
        createdAt: "2026-05-26T20:00:00.000Z",
        updatedAt: "2026-05-26T20:00:00.000Z"
      }
    ],
    transitions: []
  };
  fs.writeFileSync(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`);

  const metaPath = path.join(tmp, "task-state/snapshots/genesis.meta.json");
  const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
  meta.contentDigest = digestTaskStateCanonicalJson(snapshot);
  meta.taskCount = 1;
  fs.writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`);

  const event = {
    schemaVersion: 1,
    eventId: "evt.snapshot-tail-1",
    sequence: 1,
    parentEventId: null,
    recordedAt: "2026-05-26T20:01:00.000Z",
    actor: { id: "system", source: "system" },
    command: { name: "run-transition", moduleId: "task-engine" },
    kind: "task.transitioned",
    payload: {
      taskId: "T1",
      fromState: "ready",
      toState: "in_progress",
      action: "start",
      transitionId: "T1-start",
      guardResults: [{ allowed: true, guardName: "state-validity" }],
      dependentsUnblocked: []
    },
    expectedTaskVersion: 1
  };
  fs.writeFileSync(path.join(tmp, "task-state/events/0000000000.jsonl"), `${JSON.stringify(event)}\n`);

  const manifestPath = path.join(tmp, "task-state/manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.head.latestSequence = 1;
  manifest.head.latestEventId = event.eventId;
  manifest.manifestDigest = computeManifestDigest(manifest);
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const result = verifyTaskStateLayoutOnDisk(tmp);
  assert.equal(result.passed, true, JSON.stringify(result.findings));
});

test("verify catches unsupported schema version in events jsonl", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wk-verify-schema-"));
  copyLayout(tmp);
  const eventPath = path.join(tmp, "task-state/events/0000000000.jsonl");
  const badEvent = {
    schemaVersion: 99,
    eventId: "tse.bad",
    sequence: 0,
    parentEventId: null,
    recordedAt: "2026-05-26T20:00:00.000Z",
    actor: { id: "system", source: "system" },
    command: { name: "create-task", moduleId: "task-engine" },
    kind: "task.created",
    payload: {
      taskId: "T1",
      initialStatus: "proposed",
      title: "bad",
      type: "workspace-kit"
    }
  };
  fs.writeFileSync(eventPath, `${JSON.stringify(badEvent)}\n`);
  const manifestPath = path.join(tmp, "task-state/manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.head.latestSequence = 0;
  manifest.head.latestEventId = "tse.bad";
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const result = verifyTaskStateLayoutOnDisk(tmp);
  assert.equal(result.passed, false);
  assert.ok(
    result.findings.some((f) => f.code === "event-unsupported-schema-version")
  );
});

test("verify catches parent mismatch", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wk-verify-parent-"));
  copyLayout(tmp);
  const fixturesDir = path.join(
    repoRoot,
    "src/modules/task-engine/task-state-events/fixtures"
  );
  const stream = JSON.parse(
    fs.readFileSync(path.join(fixturesDir, "replay-stream-lifecycle.v1.json"), "utf8")
  );
  const eventPath = path.join(tmp, "task-state/events/0000000000.jsonl");
  const broken = stream.map((event, index) =>
    index === 1 ? { ...event, parentEventId: "wrong-parent" } : event
  );
  fs.writeFileSync(eventPath, `${broken.map((e) => JSON.stringify(e)).join("\n")}\n`);
  const manifestPath = path.join(tmp, "task-state/manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.head.latestSequence = broken.at(-1)?.sequence ?? 0;
  manifest.head.latestEventId = broken.at(-1)?.eventId ?? null;
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const result = verifyTaskStateLayoutOnDisk(tmp);
  assert.equal(result.passed, false);
  assert.ok(result.findings.some((f) => f.code === "event-parent-mismatch"));
});

test("verify catches missing sequence gap", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wk-verify-gap-"));
  copyLayout(tmp);
  const fixturesDir = path.join(
    repoRoot,
    "src/modules/task-engine/task-state-events/fixtures"
  );
  const stream = JSON.parse(
    fs.readFileSync(path.join(fixturesDir, "replay-stream-lifecycle.v1.json"), "utf8")
  );
  const e1 = { ...stream[0], sequence: 1, parentEventId: null };
  const e2 = { ...stream[1], sequence: 2, parentEventId: e1.eventId };
  const e4 = { ...stream[3], sequence: 4, parentEventId: e2.eventId };
  const eventPath = path.join(tmp, "task-state/events/0000000000.jsonl");
  fs.writeFileSync(eventPath, `${[e1, e2, e4].map((e) => JSON.stringify(e)).join("\n")}\n`);
  const manifestPath = path.join(tmp, "task-state/manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.head.latestSequence = 4;
  manifest.head.latestEventId = e4.eventId;
  manifest.head.latestSnapshotId = null;
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const result = verifyTaskStateLayoutOnDisk(tmp);
  assert.equal(result.passed, false);
  assert.ok(result.findings.some((f) => f.code === "event-sequence-gap"));
});

test("runTaskStateVerify command wraps layout verification", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wk-verify-cmd-"));
  copyLayout(tmp);
  const result = await runTaskStateVerify(
    { workspacePath: tmp, config: {} },
    { source: "local", layoutRoot: "." }
  );
  assert.equal(result.ok, true);
  assert.equal(result.data.passed, true);
});

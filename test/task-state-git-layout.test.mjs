import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  TASK_STATE_GIT_BRANCH,
  TASK_STATE_MANIFEST_RELATIVE,
  computeManifestDigest,
  createDefaultTaskStateGitManifest,
  digestTaskStateCanonicalJson,
  formatEventSegmentFilename,
  resolveEventSegmentRelativePath,
  resolveSnapshotContentRelativePath,
  resolveSnapshotMetaRelativePath,
  validateTaskStateGitManifest,
  validateTaskStateGitSnapshotMeta
} from "../dist/modules/task-engine/task-state-git/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const layoutRoot = path.join(
  root,
  "src/modules/task-engine/task-state-git/fixtures/branch-layout"
);

function readJson(relativeFromLayout) {
  return JSON.parse(
    fs.readFileSync(path.join(layoutRoot, relativeFromLayout), "utf8")
  );
}

test("canonical branch layout paths exist under fixtures", () => {
  const required = [
    TASK_STATE_MANIFEST_RELATIVE,
    resolveEventSegmentRelativePath(0),
    resolveSnapshotMetaRelativePath("genesis"),
    resolveSnapshotContentRelativePath("genesis")
  ];
  for (const rel of required) {
    assert.ok(fs.existsSync(path.join(layoutRoot, rel)), `missing ${rel}`);
  }
});

test("formatEventSegmentFilename pads segment index", () => {
  assert.equal(formatEventSegmentFilename(0), "0000000000.jsonl");
  assert.equal(formatEventSegmentFilename(42), "0000000042.jsonl");
});

test("createDefaultTaskStateGitManifest validates with self-consistent digest", () => {
  const manifest = createDefaultTaskStateGitManifest();
  assert.equal(manifest.branch, TASK_STATE_GIT_BRANCH);
  const result = validateTaskStateGitManifest(manifest, { verifyManifestDigest: true });
  assert.equal(result.ok, true);
  assert.equal(manifest.manifestDigest, computeManifestDigest(manifest));
});

test("branch-layout manifest fixture validates after digest repair", () => {
  const raw = readJson("task-state/manifest.json");
  const withoutDigest = { ...raw };
  delete withoutDigest.manifestDigest;
  const manifest = { ...withoutDigest, manifestDigest: computeManifestDigest(withoutDigest) };
  const result = validateTaskStateGitManifest(manifest, { verifyManifestDigest: true });
  assert.equal(result.ok, true, result.ok ? "" : result.errors.join("; "));
});

test("genesis snapshot meta fixture validates and matches content digest", () => {
  const content = readJson("task-state/snapshots/genesis.json");
  const meta = readJson(resolveSnapshotMetaRelativePath("genesis"));
  assert.equal(meta.contentDigest, digestTaskStateCanonicalJson(content));
  const result = validateTaskStateGitSnapshotMeta(meta);
  assert.equal(result.ok, true, result.ok ? "" : result.errors.join("; "));
});

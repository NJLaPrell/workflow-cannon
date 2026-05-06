import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  CAE_WORKSPACE_ARTIFACT_TYPES,
  buildCaeWorkspaceArtifactPath,
  classifyCaeArtifactIdNamespace,
  getCaeWorkspaceArtifactDirectory,
  isCaeWorkspaceArtifactType,
  validateCaeWorkspaceArtifactId,
  validateCaeWorkspaceArtifactSlug
} from "../dist/core/cae/workspace-artifact-conventions.js";

const expectedDirectories = {
  playbook: ".ai/cae/artifacts/playbooks",
  runbook: ".ai/cae/artifacts/runbooks",
  checklist: ".ai/cae/artifacts/checklists",
  "review-template": ".ai/cae/artifacts/review-templates",
  "reasoning-template": ".ai/cae/artifacts/reasoning-templates",
  "policy-doc": ".ai/cae/artifacts/policy-docs"
};

test("workspace artifact type helpers map every CAE v1 type to a directory", () => {
  assert.deepEqual([...CAE_WORKSPACE_ARTIFACT_TYPES], Object.keys(expectedDirectories));
  for (const [artifactType, directory] of Object.entries(expectedDirectories)) {
    assert.equal(isCaeWorkspaceArtifactType(artifactType), true);
    assert.equal(getCaeWorkspaceArtifactDirectory(artifactType), directory);
    const built = buildCaeWorkspaceArtifactPath(artifactType, "release-sanity");
    assert.equal(built.ok, true);
    assert.equal(built.value.path, `${directory}/release-sanity.md`);
  }
  assert.equal(isCaeWorkspaceArtifactType("cognitive-map"), false);
  assert.equal(getCaeWorkspaceArtifactDirectory("cognitive-map"), null);
});

test("workspace artifact slug validation rejects paths and traversal", () => {
  for (const slug of ["release-sanity", "release.sanity", "release_sanity", "release2"]) {
    assert.deepEqual(validateCaeWorkspaceArtifactSlug(slug), { ok: true, value: slug });
  }
  for (const slug of ["", "../escape", "escape/child", "escape\\child", "..", ".hidden", "Release-Sanity", "release--sanity"]) {
    const result = validateCaeWorkspaceArtifactSlug(slug);
    assert.equal(result.ok, false, slug);
  }
});

test("workspace artifact ids use workspace namespace and registry-safe syntax", () => {
  assert.deepEqual(validateCaeWorkspaceArtifactId("workspace.playbook.release-sanity"), {
    ok: true,
    value: "workspace.playbook.release-sanity"
  });
  for (const artifactId of ["cae.playbook.release-sanity", "workspace", "workspace.", "Workspace.playbook.x", "workspace.playbook/escape"]) {
    const result = validateCaeWorkspaceArtifactId(artifactId);
    assert.equal(result.ok, false, artifactId);
  }
  assert.equal(classifyCaeArtifactIdNamespace("cae.playbook.task-to-phase-branch"), "default");
  assert.equal(classifyCaeArtifactIdNamespace("workspace.playbook.release-sanity"), "workspace");
  assert.equal(classifyCaeArtifactIdNamespace("team.playbook.release-sanity"), "other");
  assert.equal(classifyCaeArtifactIdNamespace("bad/path"), "invalid");
});

test("workspace artifact fixtures match the helper convention", async () => {
  const root = process.cwd();
  const fixtureRoot = path.join(root, "fixtures", "cae", "workspace-artifacts");
  const manifest = JSON.parse(await readFile(path.join(fixtureRoot, "manifest.v1.json"), "utf8"));
  assert.equal(manifest.artifacts.length, CAE_WORKSPACE_ARTIFACT_TYPES.length);
  for (const artifact of manifest.artifacts) {
    const refPath = artifact.ref.path;
    const slug = path.posix.basename(refPath, ".md");
    const built = buildCaeWorkspaceArtifactPath(artifact.artifactType, slug);
    assert.equal(built.ok, true, artifact.artifactId);
    assert.equal(built.value.path, refPath);
    assert.equal(validateCaeWorkspaceArtifactId(artifact.artifactId).ok, true);
    assert.equal(existsSync(path.join(fixtureRoot, "files", refPath)), true, refPath);
  }
});
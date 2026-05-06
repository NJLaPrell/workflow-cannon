import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { buildCaeAuthoringClassificationSnapshot } from "../dist/core/cae/cae-authoring-source-classification.js";

test("CAE authoring classification exposes stable source, lifecycle, and file ownership labels", async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "wk-cae-authoring-"));
  await mkdir(path.join(workspaceRoot, ".ai", "cae", "artifacts", "playbooks"), { recursive: true });
  await mkdir(path.join(workspaceRoot, "docs", "guides"), { recursive: true });
  await mkdir(path.join(workspaceRoot, ".ai"), { recursive: true });

  await writeFile(
    path.join(workspaceRoot, ".ai", "cae", "artifacts", "playbooks", "release-sanity.md"),
    "# Release sanity\n",
    "utf8"
  );
  await writeFile(path.join(workspaceRoot, "docs", "guides", "custom-playbook.md"), "# Custom\n", "utf8");
  await writeFile(path.join(workspaceRoot, ".ai", "README.md"), "# AI\n", "utf8");

  const snapshot = buildCaeAuthoringClassificationSnapshot({
    workspaceRoot,
    activeVersionId: "cae.reg.authoring.v1",
    registryDigest: "digest-123",
    artifactRows: [
      {
        version_id: "cae.reg.authoring.v1",
        artifact_id: "cae.playbook.default-release",
        artifact_type: "playbook",
        path: ".ai/README.md",
        title: "Default release",
        description: null,
        metadata_json: "{}",
        retired_at: null
      },
      {
        version_id: "cae.reg.authoring.v1",
        artifact_id: "workspace.playbook.release-sanity",
        artifact_type: "playbook",
        path: ".ai/cae/artifacts/playbooks/release-sanity.md",
        title: "Workspace release sanity",
        description: null,
        metadata_json: "{}",
        retired_at: null
      },
      {
        version_id: "cae.reg.authoring.v1",
        artifact_id: "workspace.playbook.custom-copy",
        artifact_type: "playbook",
        path: "docs/guides/custom-playbook.md",
        title: "Copied custom playbook",
        description: null,
        metadata_json: JSON.stringify({ sourceDefaultArtifactId: "cae.playbook.default-release" }),
        retired_at: null
      },
      {
        version_id: "cae.reg.authoring.v1",
        artifact_id: "workspace.playbook.missing",
        artifact_type: "playbook",
        path: ".ai/cae/artifacts/playbooks/missing.md",
        title: "Missing file",
        description: null,
        metadata_json: "{}",
        retired_at: null
      },
      {
        version_id: "cae.reg.authoring.v1",
        artifact_id: "workspace.playbook.retired",
        artifact_type: "playbook",
        path: ".ai/cae/artifacts/playbooks/retired.md",
        title: "Retired",
        description: null,
        metadata_json: "{}",
        retired_at: "2026-05-06T00:00:00.000Z"
      }
    ],
    activationRows: [
      {
        version_id: "cae.reg.authoring.v1",
        activation_id: "cae.activation.default",
        family: "do",
        priority: 1,
        lifecycle_state: "active",
        scope_json: JSON.stringify({ conditions: [{ kind: "always" }] }),
        artifact_refs_json: JSON.stringify([
          { artifactId: "cae.playbook.default-release" },
          { artifactId: "workspace.playbook.custom-copy" },
          { artifactId: "workspace.playbook.unknown" }
        ]),
        acknowledgement_json: null,
        metadata_json: "{}",
        retired_at: null
      },
      {
        version_id: "cae.reg.authoring.v1",
        activation_id: "workspace.activation.hidden-draft",
        family: "review",
        priority: 2,
        lifecycle_state: "draft",
        scope_json: JSON.stringify({ conditions: [{ kind: "always" }] }),
        artifact_refs_json: JSON.stringify([{ artifactId: "workspace.playbook.release-sanity" }]),
        acknowledgement_json: null,
        metadata_json: JSON.stringify({ sourceArtifactId: "cae.activation.default" }),
        retired_at: null
      }
    ],
    artifactOverlayById: {
      "workspace.playbook.custom-copy": { overrideOfId: "cae.playbook.default-release" },
      "workspace.playbook.retired": { hidden: true }
    },
    activationOverlayById: {
      "workspace.activation.hidden-draft": { hidden: true, overrideOfId: "cae.activation.default" }
    }
  });

  assert.equal(snapshot.schemaVersion, 1);
  assert.equal(snapshot.activeVersionId, "cae.reg.authoring.v1");
  assert.equal(snapshot.registryDigest, "digest-123");

  const artifacts = new Map(snapshot.artifacts.map((artifact) => [artifact.artifactId, artifact]));
  assert.deepEqual(artifacts.get("cae.playbook.default-release"), {
    schemaVersion: 1,
    activeVersionId: "cae.reg.authoring.v1",
    registryDigest: "digest-123",
    artifactId: "cae.playbook.default-release",
    artifactType: "playbook",
    title: "Default release",
    path: ".ai/README.md",
    source: "default",
    lifecycleStatus: "active",
    status: "active",
    fileOwnershipStatus: "default-owned",
    fileExists: true,
    overrideOfId: null
  });
  assert.equal(artifacts.get("workspace.playbook.release-sanity").source, "workspace");
  assert.equal(artifacts.get("workspace.playbook.release-sanity").fileOwnershipStatus, "workspace-owned");
  assert.equal(artifacts.get("workspace.playbook.custom-copy").source, "override");
  assert.equal(artifacts.get("workspace.playbook.custom-copy").status, "external-allowed");
  assert.equal(artifacts.get("workspace.playbook.custom-copy").fileOwnershipStatus, "external-allowed");
  assert.equal(artifacts.get("workspace.playbook.missing").status, "missing-file");
  assert.equal(artifacts.get("workspace.playbook.missing").fileOwnershipStatus, "missing-file");
  assert.equal(artifacts.get("workspace.playbook.retired").lifecycleStatus, "hidden");
  assert.equal(artifacts.get("workspace.playbook.retired").status, "hidden");

  const activations = new Map(snapshot.activations.map((activation) => [activation.activationId, activation]));
  assert.equal(activations.get("cae.activation.default").source, "default");
  assert.equal(activations.get("cae.activation.default").status, "active");
  assert.deepEqual(activations.get("cae.activation.default").artifactRefs, [
    {
      artifactId: "cae.playbook.default-release",
      source: "default",
      status: "active",
      fileOwnershipStatus: "default-owned"
    },
    {
      artifactId: "workspace.playbook.custom-copy",
      source: "override",
      status: "external-allowed",
      fileOwnershipStatus: "external-allowed"
    },
    {
      artifactId: "workspace.playbook.unknown",
      source: null,
      status: "missing-artifact-row",
      fileOwnershipStatus: null
    }
  ]);
  assert.equal(activations.get("workspace.activation.hidden-draft").source, "override");
  assert.equal(activations.get("workspace.activation.hidden-draft").lifecycleStatus, "hidden");
  assert.equal(activations.get("workspace.activation.hidden-draft").status, "hidden");
});

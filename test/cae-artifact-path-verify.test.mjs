/**
 * CAE artifact ref.path checks — Phase 70 **T892** / CAE_PLAN C2.
 */
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { loadCaeRegistry, verifyCaeArtifactRefPathsExist } from "../dist/core/cae/cae-registry-load.js";

const ARTIFACT_ID = "cae.test.path-verify";

function minimalActivation() {
  return {
    schemaVersion: 1,
    activationId: "cae.activation.test.path-verify",
    family: "do",
    lifecycleState: "active",
    priority: 1,
    scope: { conditions: [{ kind: "always" }] },
    artifactRefs: [{ artifactId: ARTIFACT_ID }],
    flags: { advisoryOnly: true }
  };
}

async function writeRegistry(ws, artifactRefPath) {
  await mkdir(path.join(ws, ".ai", "cae", "registry"), { recursive: true });
  const art = {
    schemaVersion: 1,
    description: "test",
    artifacts: [
      {
        schemaVersion: 1,
        artifactId: ARTIFACT_ID,
        artifactType: "playbook",
        ref: { path: artifactRefPath },
        title: "t",
        tags: ["cae"]
      }
    ]
  };
  const act = {
    schemaVersion: 1,
    description: "test",
    activations: [minimalActivation()]
  };
  await writeFile(path.join(ws, ".ai", "cae", "registry", "artifacts.v1.json"), JSON.stringify(art), "utf8");
  await writeFile(path.join(ws, ".ai", "cae", "registry", "activations.v1.json"), JSON.stringify(act), "utf8");
}

test("verifyCaeArtifactRefPathsExist rejects absolute ref.path", () => {
  const v = verifyCaeArtifactRefPathsExist(process.cwd(), [{ ref: { path: "/etc/passwd" } }]);
  assert.ok(v && v.ok === false);
  assert.equal(v.code, "cae-artifact-path-invalid");
});

test("verifyCaeArtifactRefPathsExist rejects path escaping workspace root", async () => {
  const base = await mkdtemp(path.join(os.tmpdir(), "wk-cae-path-"));
  const ws = path.join(base, "workspace");
  const outsider = path.join(base, "outside");
  await mkdir(ws, { recursive: true });
  await mkdir(outsider, { recursive: true });
  await writeFile(path.join(outsider, "secret.txt"), "x", "utf8");
  const v = verifyCaeArtifactRefPathsExist(ws, [{ ref: { path: "../outside/secret.txt" } }]);
  assert.ok(v && v.ok === false);
  assert.equal(v.code, "cae-artifact-path-invalid");
});

test("loadCaeRegistry rejects traversal ref.path that passes schema pattern", async () => {
  const base = await mkdtemp(path.join(os.tmpdir(), "wk-cae-load-escape-"));
  const ws = path.join(base, "workspace");
  const leakDir = path.join(base, "leak");
  await mkdir(ws, { recursive: true });
  await mkdir(leakDir, { recursive: true });
  await writeFile(path.join(leakDir, "secret.txt"), "x", "utf8");
  await writeRegistry(ws, ".ai/../../leak/secret.txt");
  const r = loadCaeRegistry(ws, { verifyArtifactPaths: true });
  assert.equal(r.ok, false);
  assert.equal(r.code, "cae-artifact-path-invalid");
});

test("loadCaeRegistry ok when ref.path is inside workspace and file exists", async () => {
  const ws = await mkdtemp(path.join(os.tmpdir(), "wk-cae-load-ok-"));
  await mkdir(path.join(ws, "docs"), { recursive: true });
  await writeFile(path.join(ws, "docs", "cae-target.txt"), "ok", "utf8");
  await writeRegistry(ws, "docs/cae-target.txt");
  const r = loadCaeRegistry(ws, { verifyArtifactPaths: true });
  assert.equal(r.ok, true);
});

/**
 * Content-based CAE registry digest (**T894**).
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  digestCaeRegistryContent,
  JSON_REGISTRY_DIGEST_VERSION_ID
} from "../dist/core/cae/cae-registry-load.js";

test("digestCaeRegistryContent changes when artifact title changes (same ids)", () => {
  const act = [
    {
      schemaVersion: 1,
      activationId: "cae.activation.test.digest",
      family: "do",
      lifecycleState: "active",
      priority: 1,
      scope: { conditions: [{ kind: "always" }] },
      artifactRefs: [{ artifactId: "cae.test.digest.artifact" }],
      flags: { advisoryOnly: true }
    }
  ];
  const a1 = [
    {
      schemaVersion: 1,
      artifactId: "cae.test.digest.artifact",
      artifactType: "playbook",
      ref: { path: ".ai/README.md" },
      title: "One",
      tags: ["cae"]
    }
  ];
  const a2 = [{ ...a1[0], title: "Two" }];
  const d1 = digestCaeRegistryContent(JSON_REGISTRY_DIGEST_VERSION_ID, a1, act);
  const d2 = digestCaeRegistryContent(JSON_REGISTRY_DIGEST_VERSION_ID, a2, act);
  assert.notEqual(d1, d2);
});

test("digestCaeRegistryContent includes version id in hash", () => {
  const row = {
    schemaVersion: 1,
    artifactId: "cae.test.digest.artifact",
    artifactType: "playbook",
    ref: { path: ".ai/README.md" },
    title: "x",
    tags: ["cae"]
  };
  const act = [
    {
      schemaVersion: 1,
      activationId: "cae.activation.test.digest",
      family: "do",
      lifecycleState: "active",
      priority: 1,
      scope: { conditions: [{ kind: "always" }] },
      artifactRefs: [{ artifactId: "cae.test.digest.artifact" }],
      flags: { advisoryOnly: true }
    }
  ];
  const d1 = digestCaeRegistryContent("v-a", [row], act);
  const d2 = digestCaeRegistryContent("v-b", [row], act);
  assert.notEqual(d1, d2);
});

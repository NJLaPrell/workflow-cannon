import test from "node:test";
import assert from "node:assert/strict";

import {
  buildKitExportEnvelopeV1,
  formatKitExportEnvelopeYamlBlock,
  readSourceSequenceFromExportYaml,
  wrapJsonExportWithEnvelopeV1
} from "../dist/core/kit-export-envelope.js";
import { formatWorkspaceStatusDbExportYaml } from "../dist/modules/task-engine/persistence/workspace-status-store.js";

test("formatWorkspaceStatusDbExportYaml includes kit_export_envelope with source_sequence", () => {
  const yaml = formatWorkspaceStatusDbExportYaml({
    workspaceRevision: 42,
    currentKitPhase: "114",
    nextKitPhase: "115",
    activeFocus: "focus",
    lastUpdated: "2026-05-26T00:00:00.000Z",
    blockers: [],
    pendingDecisions: [],
    nextAgentActions: [],
    updatedAt: "2026-05-26T00:00:00.000Z"
  });
  assert.match(yaml, /kit_export_envelope:/);
  assert.match(yaml, /authoritative: false/);
  assert.match(yaml, /source_sequence: 42/);
  assert.match(yaml, /generated_at:/);
  assert.equal(readSourceSequenceFromExportYaml(yaml), 42);
});

test("readSourceSequenceFromExportYaml falls back to legacy workspace_revision comment", () => {
  const body = "# workspace_revision: 7\nschema_version: 1\n";
  assert.equal(readSourceSequenceFromExportYaml(body), 7);
});

test("wrapJsonExportWithEnvelopeV1 marks non-authoritative envelope", () => {
  const envelope = buildKitExportEnvelopeV1({ sourceSequence: 1, sourceKind: "test" });
  const wrapped = wrapJsonExportWithEnvelopeV1(envelope, { schemaVersion: 1, features: [] });
  assert.equal(wrapped.kitExportEnvelope.authoritative, false);
  assert.equal(wrapped.kitExportEnvelope.sourceKind, "test");
});

test("formatKitExportEnvelopeYamlBlock is stable shape", () => {
  const block = formatKitExportEnvelopeYamlBlock(
    buildKitExportEnvelopeV1({
      sourceSequence: 0,
      sourceKind: "kit_workspace_status",
      generatedAt: "2026-01-01T00:00:00.000Z"
    })
  );
  assert.match(block, /role: "sqlite-projection-export"/);
});

import test from "node:test";
import assert from "node:assert/strict";

import { buildImprovementTaskPayload, computeHeuristicConfidence } from "../dist/index.js";

test("buildImprovementTaskPayload: transcript includes issue, resolution, and scopes", () => {
  const confidence = computeHeuristicConfidence("transcript", { transcriptFriction: 0.5 });
  const p = buildImprovementTaskPayload({
    evidenceKind: "transcript",
    evidenceKey: "k",
    title: "legacy",
    provenanceRefs: {
      transcriptPath: "agent-transcripts/a.jsonl",
      sampleLine: "policy denied again",
      scoredTextExcerpt: "policy denied again",
      transcriptRole: "user",
      linesScannedInSlice: "3",
      frictionHitsInSlice: "1",
      pipelineAdmissionSummary: "Scanned **3** new JSONL line(s). **1** friction hit(s)."
    },
    signals: { transcriptFriction: 0.5 },
    confidence
  });
  assert.ok(p.title.includes("a.jsonl"));
  assert.ok(p.issue.includes("Problem report"));
  assert.ok(p.issue.includes("agent-transcripts/a.jsonl"));
  assert.ok(p.issue.includes("policy"));
  assert.ok(p.issue.includes("pipeline forensics"));
  assert.ok(p.proposedSolution.includes("POLICY-APPROVAL"));
  assert.ok(p.approach.includes("Recommended change"));
  assert.ok(p.technicalScope.length >= 2);
  assert.ok(p.acceptanceCriteria.length >= 1);
});

test("buildImprovementTaskPayload: policy_deny names operation and doc fix", () => {
  const confidence = computeHeuristicConfidence("policy_deny", { policyDenial: 0.72 });
  const p = buildImprovementTaskPayload({
    evidenceKind: "policy_deny",
    evidenceKey: "k",
    title: "legacy",
    provenanceRefs: {
      operationId: "tasks.run-transition",
      command: "run run-transition",
      traceTimestamp: "2026-01-01T00:00:00.000Z"
    },
    signals: { policyDenial: 0.72 },
    confidence
  });
  assert.ok(p.issue.includes("tasks.run-transition"));
  assert.ok(p.proposedSolution.includes("AGENT-CLI-MAP"));
});

import assert from "node:assert/strict";
import test from "node:test";

import { buildReleaseCloseoutResult } from "../dist/modules/task-engine/release-closeout-result-runtime.js";

function task(id, overrides = {}) {
  return {
    id,
    status: "completed",
    type: "execution",
    title: `Task ${id}`,
    createdAt: "2026-06-03T00:00:00.000Z",
    updatedAt: "2026-06-03T00:00:00.000Z",
    archived: false,
    phaseKey: "130",
    dependsOn: [],
    ...overrides
  };
}

test("buildReleaseCloseoutResult emits placeholder-free final report and concrete command sequence", () => {
  const result = buildReleaseCloseoutResult({
    workspacePath: process.cwd(),
    tasks: [
      task("T100688"),
      task("T-other-phase", { phaseKey: "129" }),
      task("T-improvement", { type: "improvement" })
    ],
    phaseKey: "130",
    planningGeneration: 42,
    createdAt: "2026-06-03T21:00:00.000Z",
    commandArgs: {
      releaseVersion: "0.99.27",
      packageName: "@workflow-cannon/workspace-kit",
      releaseNotes: {
        source: "release-evidence-manifest.releaseNotes",
        entries: [
          "Added release-closeout-result final packets.",
          "Linked packet-first prompt sequence for release closeout."
        ]
      },
      followUpSummary: {
        count: 0,
        scannedAt: "2026-06-03T21:00:00.000Z",
        rationale: "No follow-up execution tasks recorded."
      },
      postReleaseEvidence: {
        branchesAndPrs: ["release/phase-130", "PR #600"],
        tag: "v0.99.27",
        publishedPackage: "@workflow-cannon/workspace-kit@0.99.27",
        ci: ["test: success"],
        workspace: { currentKitPhase: "131", releasedPhase: "130" }
      },
      risks: [{ label: "Residual", message: "Dashboard prompt integration lands separately." }]
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.packet.packetKind, "releaseCloseoutResult");
  assert.equal(result.packet.finalReport.placeholderFree, true);
  assert.match(result.packet.finalReport.markdown, /Phase 130 has been delivered!/);
  assert.match(result.packet.finalReport.markdown, /1 tasks complete/);
  assert.match(result.packet.finalReport.markdown, /none follow-on tasks/);
  assert.doesNotMatch(result.packet.finalReport.markdown, /[{}]/);
  assert.deepEqual(
    result.packet.refs.commandSequence.map((ref) => ref.command),
    [
      "phase-release-orchestration-state",
      "phase-drain-delta",
      "phase-release-state",
      "prepare-release-artifacts",
      "release-closeout-result"
    ]
  );
  assert.deepEqual(result.packet.releaseEvidence.missingFinalEvidence, []);
  assert.equal(result.packet.releaseEvidence.postReleaseEvidence.tag, "v0.99.27");
  assert.ok(
    result.packet.refs.concreteRefs.some((ref) => ref.field === "completedExecutionTaskCount")
  );
  assert.ok(
    result.packet.refs.concreteRefs.every((ref) => typeof ref.ref.commandLine === "string" && ref.ref.commandLine.length > 0)
  );
});

test("buildReleaseCloseoutResult keeps missing final evidence explicit", () => {
  const result = buildReleaseCloseoutResult({
    workspacePath: process.cwd(),
    tasks: [task("T100688")],
    phaseKey: "130",
    planningGeneration: 42,
    commandArgs: {
      releaseVersion: "0.99.27",
      packageName: "@workflow-cannon/workspace-kit",
      releaseNotes: {
        source: "test",
        entries: ["Added concrete final evidence fields."]
      },
      followUpSummary: {
        count: 0,
        scannedAt: "2026-06-03T21:00:00.000Z",
        rationale: "No follow-up execution tasks recorded."
      }
    }
  });

  assert.equal(result.ok, true);
  assert.ok(result.packet.releaseEvidence.missingFinalEvidence.includes("postReleaseEvidence.tag"));
  assert.ok(result.packet.releaseEvidence.missingFinalEvidence.includes("postReleaseEvidence.workspace"));
  assert.ok(result.packet.refs.concreteRefs.some((ref) => ref.field === "postReleaseEvidence"));
});

test("buildReleaseCloseoutResult refuses to emit template-like report without evidence", () => {
  const result = buildReleaseCloseoutResult({
    workspacePath: process.cwd(),
    tasks: [task("T100688")],
    phaseKey: "130",
    planningGeneration: 42,
    commandArgs: {
      releaseVersion: "0.99.27",
      packageName: "@workflow-cannon/workspace-kit"
    }
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, "release-closeout-result-insufficient-evidence");
  assert.ok(result.details.missingFields.includes("releaseNotes.entries"));
  assert.ok(result.details.missingFields.includes("followUpSummary.scannedAt"));
});

test("buildReleaseCloseoutResult refuses evidence that still contains placeholder braces", () => {
  const result = buildReleaseCloseoutResult({
    workspacePath: process.cwd(),
    tasks: [task("T100688")],
    phaseKey: "130",
    planningGeneration: 42,
    commandArgs: {
      releaseVersion: "0.99.27",
      packageName: "@workflow-cannon/workspace-kit",
      releaseNotes: {
        source: "test",
        entries: ["Added {feature} placeholder."]
      },
      followUpSummary: {
        count: 0,
        scannedAt: "2026-06-03T21:00:00.000Z",
        rationale: "No follow-up execution tasks recorded."
      }
    }
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, "release-closeout-result-placeholder-token");
});

test("buildReleaseCloseoutResult can consume release-evidence-manifest payload", () => {
  const result = buildReleaseCloseoutResult({
    workspacePath: process.cwd(),
    tasks: [task("T100688")],
    phaseKey: "130",
    planningGeneration: 42,
    commandArgs: {
      manifest: {
        releaseVersion: "0.99.27",
        packageName: "@workflow-cannon/workspace-kit",
        releaseNotes: {
          source: "manifest",
          entries: ["Manifest-backed shipped feature."]
        },
        followUpSummary: {
          count: 1,
          scannedAt: "2026-06-03T21:00:00.000Z",
          rationale: null
        },
        followUpTasks: [{ taskId: "T100999", title: "Follow-up", status: "ready" }]
      }
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.packet.releaseVersion, "0.99.27");
  assert.match(result.packet.finalReport.markdown, /1 follow-on tasks/);
  assert.match(result.packet.finalReport.markdown, /T100999 - Follow-up \(ready\)/);
});

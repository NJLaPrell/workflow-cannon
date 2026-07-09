/** T100833 — MCP planner-packet truncation stress fixtures + D3 overflow gate (WBS-16). */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  applyPlannerPacketTruncationLadder,
  buildPlannerPacketFromReads,
  handleMcpRequest,
  invokePlannerPacket,
  MCP_PLANNER_PACKET_OUTPUT_BYTE_BUDGET,
  PLANNER_PACKET_TOOL_NAME
} from "../dist/mcp/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stressPlanArtifactPath = path.join(
  root,
  "fixtures/planning/plan-artifact-truncation-stress.valid.v1.json"
);
const stressPlanArtifact = JSON.parse(fs.readFileSync(stressPlanArtifactPath, "utf8"));

const STRESS_IDEATION_NOTE =
  "Ideation stress padding — operators brainstormed edge cases for MCP planner-packet truncation under D3 budgets. ".repeat(
    400
  );

function buildStressIdeaPlan() {
  return {
    status: "planning",
    agentDirective: { schemaVersion: 1, state: "planning", questions: [] },
    wbs: stressPlanArtifact.wbs,
    brainstorm: {
      sessions: [
        {
          sessionId: "brainstorm-stress-1",
          ideationNotes: STRESS_IDEATION_NOTE,
          transcript: [
            { role: "user", text: STRESS_IDEATION_NOTE.slice(0, 8000) },
            { role: "assistant", text: STRESS_IDEATION_NOTE.slice(8000, 16_000) }
          ]
        },
        {
          sessionId: "brainstorm-stress-2",
          ideationNotes: STRESS_IDEATION_NOTE,
          transcript: [{ role: "user", text: STRESS_IDEATION_NOTE.slice(0, 6000) }]
        }
      ],
      synthesis: {
        priorityScore: 0.91,
        valueScore: 0.88,
        riskScore: 0.42,
        effortScore: 0.77,
        confidenceScore: 0.83,
        scoredSessions: ["brainstorm-stress-1", "brainstorm-stress-2"]
      }
    }
  };
}

const D3_TRUNCATION_ORDER = [
  "drop-ideation-transcript",
  "reduce-wbs-preview",
  "drop-brainstorm-synthesis-scores"
];

function flowStatusForStressIdea() {
  return {
    ok: true,
    code: "planner-flow-status",
    message: "planning stage",
    data: {
      responseSchemaVersion: 1,
      goldenPathStage: "planning",
      ideaCount: 1,
      ideaId: "I099",
      planRef: "plan-artifact:truncation-stress",
      sessionStatus: "active",
      blockers: [],
      mismatches: [],
      recommendedNextCommand: {
        command: "planner-chat",
        rationale: "continue planning after truncation stress load",
        readyRun: {
          args: { ideaId: "I099" },
          argv: "workspace-kit run planner-chat '{\"ideaId\":\"I099\"}'"
        }
      },
      planningGeneration: 42,
      planningGenerationPolicy: "require"
    }
  };
}

function ideaResultFromStressFixture() {
  return {
    ok: true,
    code: "idea-retrieved",
    message: "stress idea",
    data: {
      responseSchemaVersion: 1,
      idea: {
        id: "I099",
        title: "MCP planner truncation stress idea",
        status: "open",
        sortOrder: 99,
        linkedPlanArtifact: "plan-artifact:truncation-stress"
      },
      ideaPlan: buildStressIdeaPlan()
    }
  };
}

function createStressRuntime() {
  return {
    listCommands() {
      return [];
    },
    describeCommand() {
      return undefined;
    },
    async invoke(invocation) {
      if (invocation.name === "get-planner-flow-status") {
        return flowStatusForStressIdea();
      }
      if (invocation.name === "get-idea") {
        return ideaResultFromStressFixture();
      }
      throw new Error(`unexpected invoke ${invocation.name}`);
    }
  };
}

function assertD3TruncationOrder(steps) {
  let cursor = 0;
  for (const step of steps) {
    const next = D3_TRUNCATION_ORDER.indexOf(step, cursor);
    assert.notEqual(next, -1, `unexpected truncation step ${step}`);
    cursor = next + 1;
  }
}

test("D3 truncation ladder drops fields in architecture order under stress load", () => {
  const built = buildPlannerPacketFromReads({
    flowStatus: flowStatusForStressIdea(),
    ideaResult: ideaResultFromStressFixture()
  });
  const { packet, truncated, truncationSteps } = applyPlannerPacketTruncationLadder(built.data);

  assert.equal(truncated, true);
  assertD3TruncationOrder(truncationSteps);
  assert.ok(truncationSteps.includes("drop-ideation-transcript"));
  assert.equal(packet.ideationTranscript, undefined);
  assert.ok(packet.wbsPreview?.length >= 3);
  assert.ok(packet.recommendedNextCommand?.command, "recommendedNextCommand survives truncation");
  assertWithinPlannerPacketBudget("post-ladder packet", packet);
});

test("tight budget forces full D3 truncation ladder on stress packet", () => {
  const built = buildPlannerPacketFromReads({
    flowStatus: flowStatusForStressIdea(),
    ideaResult: ideaResultFromStressFixture()
  });
  const tightBudget = 1_000;
  const { packet, truncated, truncationSteps } = applyPlannerPacketTruncationLadder(
    built.data,
    tightBudget
  );

  assert.equal(truncated, true);
  assert.deepEqual(truncationSteps, D3_TRUNCATION_ORDER);
  assert.equal(packet.wbsPreview?.length, 3);
  assert.equal(packet.brainstormSynthesisScores, undefined);
  assert.ok(packet.recommendedNextCommand?.command, "recommendedNextCommand survives full ladder");
  assertWithinPlannerPacketBudget("tight-budget packet", packet, 1_250);
});

function assertWithinPlannerPacketBudget(label, payload, byteBudget = MCP_PLANNER_PACKET_OUTPUT_BYTE_BUDGET) {
  const bytes = Buffer.byteLength(JSON.stringify(payload), "utf8");
  assert.ok(
    bytes <= byteBudget,
    `${label} exceeds planner-packet budget (${bytes} > ${byteBudget})`
  );
}

test("stress fixture lands under fixtures/planning with twenty plus WBS rows", () => {
  assert.equal(stressPlanArtifact.identity.title, "MCP planner truncation stress plan artifact");
  assert.ok(Array.isArray(stressPlanArtifact.wbs), "plan artifact wbs is present");
  assert.ok(stressPlanArtifact.wbs.length >= 20, "fixture carries 20+ WBS rows");
  const ideaPlan = buildStressIdeaPlan();
  assert.equal(ideaPlan.brainstorm?.sessions?.length, 2, "two brainstorm sessions");
  assert.ok(
    ideaPlan.brainstorm.sessions.every((session) => typeof session.ideationNotes === "string"),
    "sessions include long ideation notes"
  );
});

test("stress IdeaPlan builds an oversized planner packet before truncation", () => {
  const built = buildPlannerPacketFromReads({
    flowStatus: flowStatusForStressIdea(),
    ideaResult: ideaResultFromStressFixture()
  });
  assert.equal(built.ok, true);
  const rawBytes = Buffer.byteLength(JSON.stringify(built.data), "utf8");
  assert.ok(
    rawBytes > MCP_PLANNER_PACKET_OUTPUT_BYTE_BUDGET,
    `pre-truncation packet should exceed budget to exercise ladder (got ${rawBytes})`
  );
  assert.equal(built.data.wbsPreview.length, 5, "builder caps preview at five rows before ladder");
});

test("invokePlannerPacket stays within registered twenty KiB budget for stress fixture", async () => {
  const out = await invokePlannerPacket(createStressRuntime(), { ideaId: "I099" });
  assert.equal(out.ok, true);
  assert.equal(out.data.truncated, true);
  assertD3TruncationOrder(out.data.truncationSteps);
  assert.ok(out.data.truncationSteps.includes("drop-ideation-transcript"));
  assertWithinPlannerPacketBudget("invokePlannerPacket data", out.data);
});

test("MCP planner-packet envelope stays within registered budget under stress load (CI overflow gate)", async () => {
  const runtime = createStressRuntime();
  const response = await handleMcpRequest(
    {
      jsonrpc: "2.0",
      id: "planner-truncation-stress",
      method: "tools/call",
      params: {
        name: PLANNER_PACKET_TOOL_NAME,
        arguments: { ideaId: "I099" }
      }
    },
    { runtime }
  );

  assert.equal(response?.error, undefined, JSON.stringify(response?.error));
  const envelopeText = response.result.content.at(0).text;
  const envelope = JSON.parse(envelopeText);
  assert.notEqual(envelope.oversized, true, "stress path must not return oversized MCP envelope");
  assert.equal(envelope.tool, PLANNER_PACKET_TOOL_NAME);
  assert.equal(envelope.result.data.truncated, true);
  assertWithinPlannerPacketBudget("MCP envelope.result.data", envelope.result.data);
  assert.ok(
    Buffer.byteLength(envelopeText, "utf8") <= MCP_PLANNER_PACKET_OUTPUT_BYTE_BUDGET,
    "full MCP envelope must fit registered planner-packet budget"
  );
});

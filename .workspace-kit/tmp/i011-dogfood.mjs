import { runCli } from "../../dist/cli.js";

async function run(command, args) {
  const lines = [];
  const exitCode = await runCli(["run", command, JSON.stringify(args)], {
    writeLine: (m) => lines.push(m),
    writeError: (m) => lines.push(m)
  });
  if (exitCode !== 0) {
    throw new Error(`exit ${exitCode}: ${lines.join("\n")}`);
  }
  return JSON.parse(lines.at(-1));
}

const planId = "d0283a5e-a782-4700-83c0-7a5824d6dd3c";

const flow = await run("get-planner-flow-status", { ideaId: "I011" });
console.log("flow", flow.ok, flow.data?.goldenPathStage);

const existing = await run("get-plan-artifact", { planId });
console.log("artifact", existing.ok, existing.data?.artifact?.status, existing.data?.artifact?.version);

let planningGen = existing.data?.planningGeneration ?? flow.data?.planningGeneration ?? 116;

if (existing.data?.artifact?.status !== "accepted") {
  const review = await run("review-plan-artifact", {
    planId,
    profile: "minimal",
    recordReview: true,
    expectedPlanningGeneration: planningGen,
    policyApproval: { confirmed: true, rationale: "I011 phase 144 dogfood review" }
  });
  console.log("review", review.ok, review.data?.passed);
  planningGen = review.data.planningGeneration;

  const accepted = await run("accept-plan-artifact", {
    planId,
    approvalRecord: {
      schemaVersion: 1,
      confirmed: true,
      approvedVersion: review.data.version,
      approvedAt: new Date().toISOString(),
      approvedBy: "phase-144-dogfood",
      planRef: existing.data.artifact.planRef
    },
    expectedPlanningGeneration: planningGen,
    policyApproval: { confirmed: true, rationale: "I011 phase 144 dogfood accept" }
  });
  console.log("accept", accepted.ok, accepted.code);
  planningGen = accepted.data.planningGeneration;
} else {
  console.log("accept skipped — already accepted");
}

const preview = await run("finalize-plan-to-phase", {
  planId,
  dryRun: true,
  targetPhaseKey: "144",
  targetPhase: "Phase 144",
  desiredStatus: "ready",
  allowPhaseKeyCollision: true,
  expectedPlanningGeneration: planningGen
});
console.log("finalize", preview.ok, preview.code, preview.data?.taskPreview?.length);

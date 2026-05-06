import assert from "node:assert/strict";
import test from "node:test";

import { resolveAgentPresentationPolicy } from "../dist/index.js";

function guidance(tier, label = `Tier ${tier}`) {
  return {
    schemaVersion: 1,
    profileSetId: "rpg_party_v1",
    tier,
    displayLabel: label,
    catalog: { tier, id: label.toLowerCase(), label, description: label },
    hints: {
      explanationStyle: "balanced",
      checkInStyle: "normal",
      questionStyle: "when_ambiguous"
    },
    usingDefaultTier: false
  };
}

test("agent presentation defaults preserve balanced visible style", () => {
  const policy = resolveAgentPresentationPolicy({
    effectiveConfig: {},
    guidance: guidance(2, "Adventurer"),
    behaviorProfile: {
      id: "builtin:balanced",
      label: "Balanced",
      dimensions: {
        explanationVerbosity: "normal",
        checkInFrequency: "normal",
        deliberationDepth: "medium"
      }
    }
  });

  assert.equal(policy.schemaVersion, 1);
  assert.equal(policy.mode, "derived");
  assert.equal(policy.workLog, "normal");
  assert.equal(policy.rationale, "simple");
  assert.equal(policy.technicality, "balanced");
  assert.equal(policy.finalAnswerDetail, "normal");
  assert.equal(policy.privateReasoning, "never_disclose");
  assert.match(policy.agentInstruction, /Reason privately/);
  assert.match(policy.agentInstruction, /Do not reveal chain-of-thought/);
});

test("agent presentation derives terse low-tier policy", () => {
  const policy = resolveAgentPresentationPolicy({
    effectiveConfig: {},
    guidance: guidance(1, "NPC"),
    behaviorProfile: {
      id: "builtin:balanced",
      label: "Balanced",
      dimensions: {
        explanationVerbosity: "normal",
        checkInFrequency: "normal"
      }
    }
  });

  assert.equal(policy.workLog, "minimal");
  assert.equal(policy.rationale, "none");
  assert.equal(policy.technicality, "plain");
  assert.equal(policy.finalAnswerDetail, "concise");
});

test("agent presentation derives technical high-tier policy", () => {
  const policy = resolveAgentPresentationPolicy({ effectiveConfig: {}, guidance: guidance(5, "BBEG") });

  assert.equal(policy.workLog, "frequent");
  assert.equal(policy.rationale, "technical");
  assert.equal(policy.technicality, "technical");
  assert.equal(policy.finalAnswerDetail, "detailed");
});

test("agent presentation temperament nudges work log and detail", () => {
  const policy = resolveAgentPresentationPolicy({
    effectiveConfig: {},
    guidance: guidance(2, "Adventurer"),
    behaviorProfile: {
      id: "builtin:cautious",
      label: "Cautious",
      dimensions: {
        explanationVerbosity: "verbose",
        checkInFrequency: "often",
        deliberationDepth: "high"
      }
    }
  });

  assert.equal(policy.workLog, "frequent");
  assert.equal(policy.finalAnswerDetail, "detailed");
  assert.ok(policy.source.fields.some((entry) => entry.source === "temperament"));
});

test("agent presentation explicit config overrides derived values", () => {
  const policy = resolveAgentPresentationPolicy({
    effectiveConfig: {
      agentPresentation: {
        mode: "explicit",
        workLog: "off",
        rationale: "technical",
        technicality: "plain",
        finalAnswerDetail: "concise"
      }
    },
    guidance: guidance(5, "BBEG"),
    behaviorProfile: {
      id: "builtin:cautious",
      label: "Cautious",
      dimensions: {
        explanationVerbosity: "verbose",
        checkInFrequency: "often"
      }
    }
  });

  assert.equal(policy.mode, "explicit");
  assert.equal(policy.workLog, "off");
  assert.equal(policy.rationale, "technical");
  assert.equal(policy.technicality, "plain");
  assert.equal(policy.finalAnswerDetail, "concise");
  assert.ok(policy.source.fields.every((entry) => entry.source === "config"));
  assert.match(policy.agentInstruction, /Always surface blockers/);
  assert.match(policy.agentInstruction, /required approvals/);
  assert.match(policy.agentInstruction, /destructive-action warnings/);
  assert.match(policy.agentInstruction, /verification failures/);
  assert.match(policy.agentInstruction, /residual risks/);
});

test("agent presentation instruction avoids thought-disclosure labels", () => {
  const policy = resolveAgentPresentationPolicy({ effectiveConfig: {}, guidance: guidance(4, "Wizard") });
  assert.doesNotMatch(policy.agentInstruction, /show thoughts/i);
  assert.doesNotMatch(policy.agentInstruction, /(?:show|display|provide|include)\s+(?:private\s+)?(?:chain-of-thought|hidden deliberation|scratchpad)/i);
  assert.doesNotMatch(policy.agentInstruction, /reveal hidden reasoning/i);
  assert.match(policy.agentInstruction, /rationale-summary/);
});

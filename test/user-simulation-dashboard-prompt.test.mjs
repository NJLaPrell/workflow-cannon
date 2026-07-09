import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { buildPhaseCompleteReleaseChatPrompt } = require("../extensions/cursor-workflow-cannon/dist/phase-complete-release-prompt.js");

test("dashboard prompt adapter is packet-first without requiring UI", () => {
  const prompt = buildPhaseCompleteReleaseChatPrompt("Phase 132", {
    phaseKey: "132",
    currentKitPhase: "132",
    nextKitPhase: "133",
    scope: "current"
  });

  assert.match(prompt, /MCP tools first/);
  assert.match(prompt, /phase-release-orchestration-state/);
  assert.match(prompt, /dashboardAuthorization":"complete-and-release"/);
  assert.match(prompt, /agent-execution-packet/);
  assert.match(prompt, /orchestrator, not the default implementer/);
  assert.doesNotMatch(prompt, /pnpm exec wk run list-tasks/);
});

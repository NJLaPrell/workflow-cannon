import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readCursorTranscriptOrchestratorContext } from "../dist/runtime/cursor-transcript-agent-activity-bridge.js";

function writeJsonl(filePath, lines) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`, "utf8");
}

test("readCursorTranscriptOrchestratorContext discovers active Task subagents", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "wc-agent-activity-home-"));
  const workspacePath = path.join(home, "repo");
  fs.mkdirSync(workspacePath, { recursive: true });
  const slug = workspacePath.split(path.sep).filter(Boolean).join("-");
  const transcriptsRoot = path.join(home, ".cursor", "projects", slug, "agent-transcripts");
  const parentId = "parent-session-1";
  const subagentId = "subagent-session-1";
  const parentPath = path.join(transcriptsRoot, parentId, `${parentId}.jsonl`);
  const subagentPath = path.join(transcriptsRoot, parentId, "subagents", `${subagentId}.jsonl`);
  const now = Date.now();
  writeJsonl(parentPath, [
    JSON.stringify({
      role: "assistant",
      message: {
        content: [
          {
            type: "tool_use",
            name: "Task",
            input: {
              description: "Worker T100401 docs",
              model: "gpt-5.3-codex",
              subagent_type: "generalPurpose",
              resume: subagentId,
              prompt: "Deliver T100401 in the repo"
            }
          }
        ]
      }
    })
  ]);
  writeJsonl(subagentPath, [
    JSON.stringify({
      role: "assistant",
      message: { content: [{ type: "text", text: "working" }] }
    })
  ]);
  fs.utimesSync(subagentPath, now / 1000, now / 1000);
  fs.utimesSync(parentPath, now / 1000, now / 1000);

  const previousHome = process.env.HOME;
  process.env.HOME = home;
  try {
    const context = readCursorTranscriptOrchestratorContext(workspacePath, {
      nowMs: now,
      activeWithinMs: 60_000
    });
    assert.ok(context);
    assert.equal(context.parentSessionId, parentId);
    assert.equal(context.activeSubagents.length, 1);
    assert.equal(context.activeSubagents[0].sessionId, subagentId);
    assert.equal(context.activeSubagents[0].model, "gpt-5.3-codex");
    assert.equal(context.activeSubagents[0].taskId, "T100401");
    assert.equal(context.activeSubagents[0].agentDefinitionId, "task-worker");
  } finally {
    process.env.HOME = previousHome;
  }
});

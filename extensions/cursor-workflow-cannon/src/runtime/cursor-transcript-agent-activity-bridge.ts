import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  extractTaskIdFromText,
  mapCursorSubagentTypeToDefinitionId,
  thinkingLevelFromModelSlug
} from "./agent-activity-profile.js";

export type CursorTranscriptTaskSpawn = {
  sessionId: string | null;
  subagentType: string;
  model: string | null;
  thinkingLevel: string | null;
  description: string | null;
  taskId: string | null;
  agentDefinitionId: string;
  agentDisplayName: string | null;
};

export type CursorTranscriptActiveSubagent = CursorTranscriptTaskSpawn & {
  transcriptRelativePath: string;
  updatedAtMs: number;
};

export type CursorTranscriptOrchestratorContext = {
  parentSessionId: string;
  parentTranscriptPath: string;
  parentUpdatedAtMs: number;
  activeSubagents: CursorTranscriptActiveSubagent[];
};

const PARENT_JSONL_RE = /^[^/]+\/[^/]+\.jsonl$/;
const SUBAGENT_JSONL_RE = /^[^/]+\/subagents\/[^/]+\.jsonl$/;

export function buildCursorProjectsAgentTranscriptsPath(workspacePath: string): string {
  const home = os.homedir();
  const resolved = path.resolve(workspacePath);
  const slug = resolved.split(path.sep).filter((segment) => segment.length > 0).join("-");
  return path.join(home, ".cursor", "projects", slug, "agent-transcripts");
}

function readTailLines(filePath: string, maxBytes = 256_000): string[] {
  try {
    const stat = fs.statSync(filePath);
    const start = Math.max(0, stat.size - maxBytes);
    const length = stat.size - start;
    const fd = fs.openSync(filePath, "r");
    try {
      const buf = Buffer.alloc(length);
      fs.readSync(fd, buf, 0, length, start);
      return buf
        .toString("utf8")
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return [];
  }
}

function parseTaskToolUsesFromLine(line: string): CursorTranscriptTaskSpawn[] {
  try {
    const row = JSON.parse(line) as {
      role?: string;
      message?: { content?: Array<{ type?: string; name?: string; input?: Record<string, unknown> }> };
    };
    if (row.role !== "assistant" || !Array.isArray(row.message?.content)) {
      return [];
    }
    const out: CursorTranscriptTaskSpawn[] = [];
    for (const part of row.message.content) {
      if (part.type !== "tool_use" || part.name !== "Task" || !part.input || typeof part.input !== "object") {
        continue;
      }
      const input = part.input;
      const sessionId = typeof input.resume === "string" && input.resume.trim().length > 0 ? input.resume.trim() : null;
      const model = typeof input.model === "string" && input.model.trim().length > 0 ? input.model.trim() : null;
      const subagentType =
        typeof input.subagent_type === "string" && input.subagent_type.trim().length > 0
          ? input.subagent_type.trim()
          : "unknown";
      const description =
        typeof input.description === "string" && input.description.trim().length > 0 ? input.description.trim() : null;
      const prompt = typeof input.prompt === "string" ? input.prompt : "";
      const taskId = extractTaskIdFromText(prompt) ?? extractTaskIdFromText(description);
      out.push({
        sessionId,
        subagentType,
        model,
        thinkingLevel: thinkingLevelFromModelSlug(model),
        description,
        taskId,
        agentDefinitionId: mapCursorSubagentTypeToDefinitionId(subagentType),
        agentDisplayName: description
      });
    }
    return out;
  } catch {
    return [];
  }
}

function listJsonlRelativePaths(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(abs);
      } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        out.push(path.relative(root, abs).split(path.sep).join("/"));
      }
    }
  };
  walk(root);
  return out;
}

function pickLatestParentTranscript(root: string, relPaths: string[]): { rel: string; abs: string; mtimeMs: number } | null {
  let best: { rel: string; abs: string; mtimeMs: number } | null = null;
  for (const rel of relPaths) {
    if (!PARENT_JSONL_RE.test(rel)) {
      continue;
    }
    const abs = path.join(root, rel);
    try {
      const mtimeMs = fs.statSync(abs).mtimeMs;
      if (!best || mtimeMs > best.mtimeMs) {
        best = { rel, abs, mtimeMs };
      }
    } catch {
      // skip unreadable transcript
    }
  }
  return best;
}

function collectTaskSpawns(parentAbs: string): {
  bySession: Map<string, CursorTranscriptTaskSpawn>;
  unassigned: CursorTranscriptTaskSpawn[];
} {
  const bySession = new Map<string, CursorTranscriptTaskSpawn>();
  const unassigned: CursorTranscriptTaskSpawn[] = [];
  for (const line of readTailLines(parentAbs)) {
    for (const spawn of parseTaskToolUsesFromLine(line)) {
      if (spawn.sessionId) {
        bySession.set(spawn.sessionId, spawn);
      } else {
        unassigned.push(spawn);
      }
    }
  }
  return { bySession, unassigned };
}

export function readCursorTranscriptOrchestratorContext(
  workspacePath: string,
  options?: { activeWithinMs?: number; nowMs?: number }
): CursorTranscriptOrchestratorContext | null {
  const root = buildCursorProjectsAgentTranscriptsPath(workspacePath);
  if (!fs.existsSync(root)) {
    return null;
  }
  const relPaths = listJsonlRelativePaths(root);
  const parent = pickLatestParentTranscript(root, relPaths);
  if (!parent) {
    return null;
  }
  const parentSessionId = path.basename(path.dirname(parent.rel));
  const activeWithinMs = options?.activeWithinMs ?? 120_000;
  const nowMs = options?.nowMs ?? Date.now();
  const { bySession } = collectTaskSpawns(parent.abs);

  const activeSubagents: CursorTranscriptActiveSubagent[] = [];
  for (const rel of relPaths) {
    if (!SUBAGENT_JSONL_RE.test(rel) || !rel.startsWith(`${parentSessionId}/subagents/`)) {
      continue;
    }
    const abs = path.join(root, rel);
    let mtimeMs = 0;
    try {
      mtimeMs = fs.statSync(abs).mtimeMs;
    } catch {
      continue;
    }
    if (nowMs - mtimeMs > activeWithinMs) {
      continue;
    }
    const sessionId = path.basename(rel, ".jsonl");
    const spawn = bySession.get(sessionId) ?? bySession.get(sessionId.replace(/-/g, "")) ?? null;
    const fallback = spawn ?? {
      sessionId,
      subagentType: "unknown",
      model: null,
      thinkingLevel: null,
      description: null,
      taskId: null,
      agentDefinitionId: "subagent",
      agentDisplayName: null
    };
    activeSubagents.push({
      ...fallback,
      sessionId,
      transcriptRelativePath: rel,
      updatedAtMs: mtimeMs
    });
  }

  activeSubagents.sort((a, b) => b.updatedAtMs - a.updatedAtMs);

  return {
    parentSessionId,
    parentTranscriptPath: parent.abs,
    parentUpdatedAtMs: parent.mtimeMs,
    activeSubagents
  };
}

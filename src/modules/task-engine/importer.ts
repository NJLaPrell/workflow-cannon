import fs from "node:fs/promises";
import type { TaskEntity, TaskStatus, TaskPriority } from "./types.js";
import { TaskEngineError } from "./transitions.js";

const STATUS_MAP: Record<string, TaskStatus> = {
  "[p]": "proposed",
  "[ ]": "ready",
  "[~]": "in_progress",
  "[!]": "blocked",
  "[x]": "completed",
  "[-]": "cancelled"
};

function parseTaskId(heading: string): string | null {
  const match = heading.match(/^###\s+\[[^\]]*\]\s+(T\d+)/);
  return match?.[1] ?? null;
}

function parseStatus(heading: string): TaskStatus {
  for (const [marker, status] of Object.entries(STATUS_MAP)) {
    if (heading.includes(marker)) return status;
  }
  return "ready";
}

function parseTitle(heading: string): string {
  const match = heading.match(/^###\s+\[[^\]]*\]\s+T\d+\s+(.+)/);
  return match?.[1]?.trim() ?? "Untitled";
}

function extractField(lines: string[], prefix: string): string | undefined {
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith(prefix)) {
      return trimmed.slice(prefix.length).trim();
    }
  }
  return undefined;
}

function extractListField(lines: string[], fieldPrefix: string): string[] {
  const items: string[] = [];
  let capturing = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith(fieldPrefix)) {
      capturing = true;
      continue;
    }
    if (capturing) {
      if (/^\s{2,}-\s/.test(line)) {
        items.push(line.replace(/^\s*-\s*/, "").trim());
        continue;
      }
      if (trimmed.startsWith("- ")) {
        capturing = false;
        continue;
      }
      if (trimmed === "") {
        continue;
      }
    }
  }

  return items;
}

function parseTaskIds(text: string): string[] {
  if (!text || text.trim() === "none") return [];
  const ids: string[] = [];
  const matches = text.matchAll(/`?(T\d+)`?/g);
  for (const m of matches) {
    ids.push(m[1]);
  }
  return ids;
}

function parsePriority(text: string | undefined): TaskPriority | undefined {
  if (!text) return undefined;
  const match = text.match(/(P[123])/);
  return match?.[1] as TaskPriority | undefined;
}

function parsePhase(sectionHeading: string): string | undefined {
  const match = sectionHeading.match(/^##\s+(.+)/);
  return match?.[1]?.trim();
}

export type ImportResult = {
  imported: number;
  skipped: number;
  errors: string[];
  tasks: TaskEntity[];
};

export async function importTasksFromMarkdown(
  sourcePath: string
): Promise<ImportResult> {
  let content: string;
  try {
    content = await fs.readFile(sourcePath, "utf8");
  } catch (err) {
    throw new TaskEngineError(
      "import-parse-error",
      `Failed to read TASKS.md: ${(err as Error).message}`
    );
  }

  const lines = content.split("\n");
  const tasks: TaskEntity[] = [];
  const errors: string[] = [];
  let skipped = 0;
  let currentPhase: string | undefined;
  const now = new Date().toISOString();

  let taskStartIdx = -1;
  let taskLines: string[] = [];

  function flushTask(): void {
    if (taskStartIdx === -1 || taskLines.length === 0) return;

    const heading = taskLines[0];
    const id = parseTaskId(heading);
    if (!id) {
      errors.push(`Line ${taskStartIdx + 1}: Could not parse task ID from heading`);
      skipped++;
      return;
    }

    const status = parseStatus(heading);
    const title = parseTitle(heading);
    const priorityStr = extractField(taskLines, "- Priority:");
    const approach = extractField(taskLines, "- Approach:");
    const dependsOnStr = extractField(taskLines, "- Depends on:");
    const unblocksStr = extractField(taskLines, "- Unblocks:");
    const technicalScope = extractListField(taskLines, "- Technical scope:");
    const acceptanceCriteria = extractListField(taskLines, "- Acceptance criteria:");

    const task: TaskEntity = {
      id,
      status,
      type: "workspace-kit",
      title,
      createdAt: now,
      updatedAt: now,
      priority: parsePriority(priorityStr),
      dependsOn: parseTaskIds(dependsOnStr ?? ""),
      unblocks: parseTaskIds(unblocksStr ?? ""),
      phase: currentPhase,
      approach: approach || undefined,
      technicalScope: technicalScope.length > 0 ? technicalScope : undefined,
      acceptanceCriteria: acceptanceCriteria.length > 0 ? acceptanceCriteria : undefined
    };

    tasks.push(task);
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith("## ") && !line.startsWith("### ")) {
      flushTask();
      taskStartIdx = -1;
      taskLines = [];
      currentPhase = parsePhase(line);
      continue;
    }

    if (line.startsWith("### ")) {
      flushTask();
      if (parseTaskId(line)) {
        taskStartIdx = i;
        taskLines = [line];
      } else {
        taskStartIdx = -1;
        taskLines = [];
      }
      continue;
    }

    if (taskStartIdx !== -1) {
      taskLines.push(line);
    }
  }

  flushTask();

  return {
    imported: tasks.length,
    skipped,
    errors,
    tasks
  };
}

import fs from "node:fs/promises";
import path from "node:path";

const REL_DIR = path.join(".workspace-kit", "agent-behavior");
const FILE_NAME = "interview-session.json";

export type BehaviorInterviewSessionV1 = {
  schemaVersion: 1;
  updatedAt: string;
  stepIndex: number;
  answers: Record<string, string>;
};

function sessionPath(workspacePath: string): string {
  return path.join(workspacePath, REL_DIR, FILE_NAME);
}

export async function persistBehaviorInterviewSession(
  workspacePath: string,
  snapshot: Omit<BehaviorInterviewSessionV1, "schemaVersion" | "updatedAt">
): Promise<void> {
  const dir = path.join(workspacePath, REL_DIR);
  await fs.mkdir(dir, { recursive: true });
  const full: BehaviorInterviewSessionV1 = {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    ...snapshot
  };
  await fs.writeFile(sessionPath(workspacePath), `${JSON.stringify(full, null, 2)}\n`, "utf8");
}

export async function clearBehaviorInterviewSession(workspacePath: string): Promise<void> {
  try {
    await fs.unlink(sessionPath(workspacePath));
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") throw err;
  }
}

export async function readBehaviorInterviewSession(
  workspacePath: string
): Promise<BehaviorInterviewSessionV1 | null> {
  try {
    const raw = await fs.readFile(sessionPath(workspacePath), "utf8");
    const parsed = JSON.parse(raw) as BehaviorInterviewSessionV1;
    if (parsed?.schemaVersion !== 1) return null;
    if (typeof parsed.stepIndex !== "number") return null;
    if (!parsed.answers || typeof parsed.answers !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

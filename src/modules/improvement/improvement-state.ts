import fs from "node:fs/promises";
import path from "node:path";

export const IMPROVEMENT_STATE_SCHEMA_VERSION = 1 as const;

export type ImprovementStateDocument = {
  schemaVersion: typeof IMPROVEMENT_STATE_SCHEMA_VERSION;
  policyTraceLineCursor: number;
  mutationLineCursor: number;
  transitionLogLengthCursor: number;
  transcriptLineCursors: Record<string, number>;
};

const DEFAULT_REL = ".workspace-kit/improvement/state.json";

function statePath(workspacePath: string): string {
  return path.join(workspacePath, DEFAULT_REL);
}

export function emptyImprovementState(): ImprovementStateDocument {
  return {
    schemaVersion: IMPROVEMENT_STATE_SCHEMA_VERSION,
    policyTraceLineCursor: 0,
    mutationLineCursor: 0,
    transitionLogLengthCursor: 0,
    transcriptLineCursors: {}
  };
}

export async function loadImprovementState(workspacePath: string): Promise<ImprovementStateDocument> {
  const fp = statePath(workspacePath);
  try {
    const raw = await fs.readFile(fp, "utf8");
    const doc = JSON.parse(raw) as ImprovementStateDocument;
    if (doc.schemaVersion !== IMPROVEMENT_STATE_SCHEMA_VERSION) {
      return emptyImprovementState();
    }
    return {
      ...emptyImprovementState(),
      ...doc,
      transcriptLineCursors: doc.transcriptLineCursors ?? {}
    };
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") {
      return emptyImprovementState();
    }
    throw e;
  }
}

export async function saveImprovementState(
  workspacePath: string,
  doc: ImprovementStateDocument
): Promise<void> {
  const fp = statePath(workspacePath);
  await fs.mkdir(path.dirname(fp), { recursive: true });
  await fs.writeFile(fp, `${JSON.stringify(doc, null, 2)}\n`, "utf8");
}

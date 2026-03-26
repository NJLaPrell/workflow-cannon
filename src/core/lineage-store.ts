import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import type { LineageEvent, LineageEventType } from "./lineage-contract.js";
import { LINEAGE_SCHEMA_VERSION, lineageCorrelationRoot } from "./lineage-contract.js";

const LINEAGE_DIR = ".workspace-kit/lineage";
const EVENTS_FILE = "events.jsonl";

function eventsPath(workspacePath: string): string {
  return path.join(workspacePath, LINEAGE_DIR, EVENTS_FILE);
}

export function newLineageEventId(): string {
  return `lev-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
}

export async function appendLineageEvent(
  workspacePath: string,
  input: {
    eventType: LineageEventType;
    recommendationTaskId: string;
    evidenceKey: string;
    payload: LineageEvent["payload"];
    eventId?: string;
    timestamp?: string;
  }
): Promise<LineageEvent> {
  const timestamp = input.timestamp ?? new Date().toISOString();
  const correlationRoot = lineageCorrelationRoot(input.recommendationTaskId, input.evidenceKey);
  const event: LineageEvent = {
    schemaVersion: LINEAGE_SCHEMA_VERSION,
    eventId: input.eventId ?? newLineageEventId(),
    eventType: input.eventType,
    timestamp,
    correlationRoot,
    payload: input.payload
  };
  const fp = eventsPath(workspacePath);
  await fs.mkdir(path.dirname(fp), { recursive: true });
  await fs.appendFile(fp, `${JSON.stringify(event)}\n`, "utf8");
  return event;
}

export async function readLineageEvents(workspacePath: string): Promise<LineageEvent[]> {
  const fp = eventsPath(workspacePath);
  let raw: string;
  try {
    raw = await fs.readFile(fp, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw e;
  }
  const out: LineageEvent[] = [];
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      const ev = JSON.parse(t) as LineageEvent;
      if (ev.schemaVersion === LINEAGE_SCHEMA_VERSION) out.push(ev);
    } catch {
      /* skip corrupt line */
    }
  }
  return out;
}

/** Reconstruct rec → dec → app chain for a recommendation task id (deterministic sort by timestamp). */
export async function queryLineageChain(
  workspacePath: string,
  recommendationTaskId: string
): Promise<{ events: LineageEvent[]; byType: Record<LineageEventType, LineageEvent[]> }> {
  const all = await readLineageEvents(workspacePath);
  const chain = all.filter((e) => {
    const p = e.payload as { recommendationTaskId?: string };
    return p.recommendationTaskId === recommendationTaskId;
  });
  chain.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const byType: Record<LineageEventType, LineageEvent[]> = {
    rec: [],
    dec: [],
    app: [],
    corr: []
  };
  for (const e of chain) {
    byType[e.eventType].push(e);
  }
  return { events: chain, byType };
}

/**
 * In-process CAE trace + bundle session store (ephemeral until T867).
 */

export type CaeSessionRecord = {
  trace: Record<string, unknown>;
  bundle: Record<string, unknown>;
};

const MAX = 512;
const sessions = new Map<string, CaeSessionRecord>();

let lastEvalAtIso: string | null = null;

export function touchCaeEvalTimestamp(): void {
  lastEvalAtIso = new Date().toISOString();
}

export function getLastCaeEvalIso(): string | null {
  return lastEvalAtIso;
}

export function storeCaeSession(traceId: string, rec: CaeSessionRecord): void {
  touchCaeEvalTimestamp();
  sessions.set(traceId, rec);
  while (sessions.size > MAX) {
    const first = sessions.keys().next().value;
    if (first !== undefined) sessions.delete(first);
  }
}

export function getCaeSession(traceId: string): CaeSessionRecord | undefined {
  return sessions.get(traceId);
}

export function clearCaeSessionsForTests(): void {
  sessions.clear();
  lastEvalAtIso = null;
}

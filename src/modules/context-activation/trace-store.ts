/**
 * In-process CAE trace + bundle session store (ephemeral until T867).
 */

export type CaeSessionRecord = {
  trace: Record<string, unknown>;
  bundle: Record<string, unknown>;
};

const MAX = 512;
const sessions = new Map<string, CaeSessionRecord>();

export function storeCaeSession(traceId: string, rec: CaeSessionRecord): void {
  sessions.set(traceId, rec);
  while (sessions.size > MAX) {
    const first = sessions.keys().next().value;
    if (first !== undefined) sessions.delete(first);
  }
}

export function getCaeSession(traceId: string): CaeSessionRecord | undefined {
  return sessions.get(traceId);
}

/**
 * T203: Immutable lineage event contract (append-only store, correlation fields).
 * @see docs/maintainers/TASKS.md T192, T203
 */

export const LINEAGE_SCHEMA_VERSION = 1 as const;

export type LineageEventType = "rec" | "dec" | "app" | "corr";

/** Recommendation enqueued (Task Engine improvement task created). */
export type LineageRecPayload = {
  recommendationTaskId: string;
  evidenceKey: string;
  title: string;
  confidence: number;
  confidenceTier: string;
  provenanceRefs: Record<string, string>;
};

/** Human approval decision recorded (before or alongside task transition). */
export type LineageDecPayload = {
  recommendationTaskId: string;
  evidenceKey: string;
  decisionVerb: "accept" | "decline" | "accept_edited";
  actor: string;
  decisionFingerprint: string;
  policyTraceRef?: { operationId: string; timestamp: string };
  /** Optional link to a config mutation evidence row when the reviewer supplies it. */
  configMutationRef?: { timestamp: string; key: string };
};

/** Applied change marker (task reached completed via acceptance). */
export type LineageAppPayload = {
  recommendationTaskId: string;
  evidenceKey: string;
  decisionFingerprint: string;
  finalTaskStatus: "completed";
};

/** Optional correlation enrichment (trace linkage). */
export type LineageCorrPayload = {
  recommendationTaskId: string;
  evidenceKey: string;
  policySchemaVersion?: number;
  policyOperationId?: string;
  policyTimestamp?: string;
  mutationRecordTimestamp?: string;
  mutationKey?: string;
};

export type LineageEvent = {
  schemaVersion: typeof LINEAGE_SCHEMA_VERSION;
  eventId: string;
  eventType: LineageEventType;
  timestamp: string;
  correlationRoot: string;
  payload: LineageRecPayload | LineageDecPayload | LineageAppPayload | LineageCorrPayload;
};

/** Stable correlation root: ties chain to recommendation + evidence identity. */
export function lineageCorrelationRoot(recommendationTaskId: string, evidenceKey: string): string {
  return `${recommendationTaskId}::${evidenceKey}`;
}

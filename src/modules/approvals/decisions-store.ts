import crypto from "node:crypto";
import {
  importApprovalDecisionsJsonlIfNeeded,
  openKitAuditDatabase
} from "../../core/state/kit-audit-sqlite.js";

export const APPROVAL_DECISION_SCHEMA_VERSION = 1 as const;

export type ApprovalDecisionRecord = {
  schemaVersion: typeof APPROVAL_DECISION_SCHEMA_VERSION;
  fingerprint: string;
  taskId: string;
  evidenceKey: string;
  decisionVerb: "accept" | "decline" | "accept_edited";
  actor: string;
  timestamp: string;
  editedSummary?: string;
  policyTraceRef?: { operationId: string; timestamp: string };
};

export function computeDecisionFingerprint(
  taskId: string,
  decisionVerb: string,
  evidenceKey: string,
  editedSummary?: string
): string {
  const norm = (editedSummary ?? "").trim();
  return crypto
    .createHash("sha256")
    .update([taskId, decisionVerb, evidenceKey, norm].join("\0"), "utf8")
    .digest("hex");
}

function withAuditDb<T>(
  workspacePath: string,
  effectiveConfig: Record<string, unknown> | undefined,
  fn: (db: ReturnType<typeof openKitAuditDatabase>) => T
): T {
  const db = openKitAuditDatabase(workspacePath, effectiveConfig);
  try {
    importApprovalDecisionsJsonlIfNeeded(db, workspacePath);
    return fn(db);
  } finally {
    db.close();
  }
}

export async function readDecisionFingerprints(
  workspacePath: string,
  effectiveConfig?: Record<string, unknown>
): Promise<Set<string>> {
  return withAuditDb(workspacePath, effectiveConfig, (db) => {
    const rows = db.prepare("SELECT fingerprint FROM kit_approval_decisions").all() as Array<{
      fingerprint: string;
    }>;
    return new Set(rows.map((r) => r.fingerprint));
  });
}

export async function appendDecisionRecord(
  workspacePath: string,
  record: Omit<ApprovalDecisionRecord, "schemaVersion" | "timestamp"> & { timestamp?: string },
  effectiveConfig?: Record<string, unknown>
): Promise<void> {
  const full: ApprovalDecisionRecord = {
    schemaVersion: APPROVAL_DECISION_SCHEMA_VERSION,
    timestamp: record.timestamp ?? new Date().toISOString(),
    ...record
  };
  withAuditDb(workspacePath, effectiveConfig, (db) => {
    db.prepare(
      `INSERT OR IGNORE INTO kit_approval_decisions
        (fingerprint, task_id, evidence_key, decision_verb, actor, recorded_at, edited_summary, policy_trace_json)
       VALUES (@fingerprint, @task_id, @evidence_key, @decision_verb, @actor, @recorded_at, @edited_summary, @policy_trace_json)`
    ).run({
      fingerprint: full.fingerprint,
      task_id: full.taskId,
      evidence_key: full.evidenceKey,
      decision_verb: full.decisionVerb,
      actor: full.actor,
      recorded_at: full.timestamp,
      edited_summary: full.editedSummary ?? null,
      policy_trace_json: full.policyTraceRef ? JSON.stringify(full.policyTraceRef) : null
    });
  });
}

export async function listApprovalDecisionRecords(
  workspacePath: string,
  effectiveConfig?: Record<string, unknown>
): Promise<ApprovalDecisionRecord[]> {
  return withAuditDb(workspacePath, effectiveConfig, (db) => {
    const rows = db
      .prepare(
        `SELECT fingerprint, task_id, evidence_key, decision_verb, actor, recorded_at, edited_summary, policy_trace_json
         FROM kit_approval_decisions ORDER BY recorded_at ASC`
      )
      .all() as Array<{
      fingerprint: string;
      task_id: string;
      evidence_key: string;
      decision_verb: string;
      actor: string;
      recorded_at: string;
      edited_summary: string | null;
      policy_trace_json: string | null;
    }>;
    return rows.map((r) => ({
      schemaVersion: APPROVAL_DECISION_SCHEMA_VERSION,
      fingerprint: r.fingerprint,
      taskId: r.task_id,
      evidenceKey: r.evidence_key,
      decisionVerb: r.decision_verb as ApprovalDecisionRecord["decisionVerb"],
      actor: r.actor,
      timestamp: r.recorded_at,
      editedSummary: r.edited_summary ?? undefined,
      policyTraceRef: r.policy_trace_json
        ? (JSON.parse(r.policy_trace_json) as ApprovalDecisionRecord["policyTraceRef"])
        : undefined
    }));
  });
}

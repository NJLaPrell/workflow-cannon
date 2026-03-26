import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

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

const DECISIONS_REL = ".workspace-kit/approvals/decisions.jsonl";

function decisionsPath(workspacePath: string): string {
  return path.join(workspacePath, DECISIONS_REL);
}

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

export async function readDecisionFingerprints(workspacePath: string): Promise<Set<string>> {
  const fp = decisionsPath(workspacePath);
  const set = new Set<string>();
  let raw: string;
  try {
    raw = await fs.readFile(fp, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return set;
    throw e;
  }
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      const rec = JSON.parse(t) as ApprovalDecisionRecord;
      if (rec.fingerprint) set.add(rec.fingerprint);
    } catch {
      /* skip */
    }
  }
  return set;
}

export async function appendDecisionRecord(
  workspacePath: string,
  record: Omit<ApprovalDecisionRecord, "schemaVersion" | "timestamp"> & { timestamp?: string }
): Promise<void> {
  const fp = decisionsPath(workspacePath);
  await fs.mkdir(path.dirname(fp), { recursive: true });
  const full: ApprovalDecisionRecord = {
    schemaVersion: APPROVAL_DECISION_SCHEMA_VERSION,
    timestamp: record.timestamp ?? new Date().toISOString(),
    ...record
  };
  await fs.appendFile(fp, `${JSON.stringify(full)}\n`, "utf8");
}

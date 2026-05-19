import type { PolicyOperationId } from "./policy.js";
import {
  getSessionGrantRow,
  listSessionGrantRows,
  upsertSessionGrantRow
} from "./state/kit-session-grants-sqlite.js";

export const SESSION_POLICY_SCHEMA_VERSION = 1 as const;

export type SessionPolicyGrant = {
  rationale: string;
  grantedAt: string;
};

export type SessionPolicyDocument = {
  schemaVersion: typeof SESSION_POLICY_SCHEMA_VERSION;
  /** Logical session id (override with WORKSPACE_KIT_SESSION_ID). */
  sessionId: string;
  /** Active grants for sensitive operations within this session file. */
  grants: Partial<Record<PolicyOperationId, SessionPolicyGrant>>;
};

export function resolveSessionId(env: NodeJS.ProcessEnv): string {
  const raw = env.WORKSPACE_KIT_SESSION_ID?.trim();
  return raw && raw.length > 0 ? raw : "default";
}

export async function loadSessionPolicyDocument(
  workspacePath: string,
  effectiveConfig?: Record<string, unknown>
): Promise<SessionPolicyDocument> {
  const sessionId = resolveSessionId(process.env);
  const rows = listSessionGrantRows(workspacePath, effectiveConfig, sessionId);
  const grants: Partial<Record<PolicyOperationId, SessionPolicyGrant>> = {};
  for (const row of rows) {
    grants[row.operationId] = { rationale: row.rationale, grantedAt: row.grantedAt };
  }
  return {
    schemaVersion: SESSION_POLICY_SCHEMA_VERSION,
    sessionId,
    grants
  };
}

export async function saveSessionPolicyDocument(
  _workspacePath: string,
  _doc: SessionPolicyDocument
): Promise<void> {
  throw new Error("saveSessionPolicyDocument is deprecated; use recordSessionGrant instead.");
}

export async function getSessionGrant(
  workspacePath: string,
  operationId: PolicyOperationId,
  sessionId: string,
  effectiveConfig?: Record<string, unknown>
): Promise<SessionPolicyGrant | undefined> {
  return getSessionGrantRow(workspacePath, operationId, sessionId, effectiveConfig);
}

export async function recordSessionGrant(
  workspacePath: string,
  operationId: PolicyOperationId,
  sessionId: string,
  rationale: string,
  effectiveConfig?: Record<string, unknown>
): Promise<void> {
  upsertSessionGrantRow(workspacePath, operationId, sessionId, rationale, effectiveConfig);
}

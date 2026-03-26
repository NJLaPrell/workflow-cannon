import fs from "node:fs/promises";
import path from "node:path";
import type { PolicyOperationId } from "./policy.js";

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

const REL = ".workspace-kit/policy/session-grants.json";

function defaultDoc(sessionId: string): SessionPolicyDocument {
  return {
    schemaVersion: SESSION_POLICY_SCHEMA_VERSION,
    sessionId,
    grants: {}
  };
}

export function resolveSessionId(env: NodeJS.ProcessEnv): string {
  const raw = env.WORKSPACE_KIT_SESSION_ID?.trim();
  return raw && raw.length > 0 ? raw : "default";
}

export async function loadSessionPolicyDocument(workspacePath: string): Promise<SessionPolicyDocument> {
  const fp = path.join(workspacePath, REL);
  try {
    const raw = await fs.readFile(fp, "utf8");
    const doc = JSON.parse(raw) as SessionPolicyDocument;
    if (doc.schemaVersion !== SESSION_POLICY_SCHEMA_VERSION) {
      return defaultDoc(resolveSessionId(process.env));
    }
    return {
      ...defaultDoc(doc.sessionId ?? resolveSessionId(process.env)),
      ...doc,
      grants: doc.grants && typeof doc.grants === "object" ? doc.grants : {}
    };
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") {
      return defaultDoc(resolveSessionId(process.env));
    }
    throw e;
  }
}

export async function saveSessionPolicyDocument(
  workspacePath: string,
  doc: SessionPolicyDocument
): Promise<void> {
  const fp = path.join(workspacePath, REL);
  await fs.mkdir(path.dirname(fp), { recursive: true });
  await fs.writeFile(fp, `${JSON.stringify(doc, null, 2)}\n`, "utf8");
}

export async function getSessionGrant(
  workspacePath: string,
  operationId: PolicyOperationId,
  sessionId: string
): Promise<SessionPolicyGrant | undefined> {
  const doc = await loadSessionPolicyDocument(workspacePath);
  if (doc.sessionId !== sessionId) {
    return undefined;
  }
  return doc.grants[operationId];
}

export async function recordSessionGrant(
  workspacePath: string,
  operationId: PolicyOperationId,
  sessionId: string,
  rationale: string
): Promise<void> {
  const doc = await loadSessionPolicyDocument(workspacePath);
  doc.sessionId = sessionId;
  doc.grants[operationId] = {
    rationale,
    grantedAt: new Date().toISOString()
  };
  await saveSessionPolicyDocument(workspacePath, doc);
}

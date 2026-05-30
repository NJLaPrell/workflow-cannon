import { readTasksCanonicalAuthority } from "../persistence/task-state-canonical-authority.js";
import { LOCAL_ONLY_BACKEND_ID } from "./local-only-backend.js";

export const LOCAL_ONLY_CLOSEOUT_WARNING_CODE = "local-only-remote-publication-expected" as const;

export type LocalOnlyCloseoutWarning = {
  code: typeof LOCAL_ONLY_CLOSEOUT_WARNING_CODE;
  severity: "warning";
  message: string;
  remediation: string;
  details: {
    backendId: typeof LOCAL_ONLY_BACKEND_ID;
    canonicalAuthority: string;
    remotePublicationExpected: boolean;
  };
};

export type AssessLocalOnlyCloseoutInput = {
  effectiveConfig?: Record<string, unknown>;
  backendId?: string;
  /** When true, closeout expects events to reach a remote canonical backend. */
  remotePublicationExpected?: boolean;
};

/**
 * Emits a closeout warning when operators expect remote publication but the active
 * backend is local-only (no Git / hosted sync).
 */
export function assessLocalOnlyCloseoutWarning(
  input: AssessLocalOnlyCloseoutInput
): LocalOnlyCloseoutWarning | null {
  const backendId = typeof input.backendId === "string" ? input.backendId.trim() : LOCAL_ONLY_BACKEND_ID;
  if (backendId !== LOCAL_ONLY_BACKEND_ID) {
    return null;
  }

  const canonicalAuthority = readTasksCanonicalAuthority(input.effectiveConfig);
  const expectsRemote =
    input.remotePublicationExpected === true || canonicalAuthority === "git-event-log";

  if (!expectsRemote) {
    return null;
  }

  return {
    code: LOCAL_ONLY_CLOSEOUT_WARNING_CODE,
    severity: "warning",
    message:
      "Closeout expects remote canonical publication, but the active backend is local-only (no Git or hosted sync).",
    remediation:
      "Switch tasks.canonicalAuthority / canonicalBackend to git or hosted before phase closeout, or confirm this phase intentionally uses local-only canonical events.",
    details: {
      backendId: LOCAL_ONLY_BACKEND_ID,
      canonicalAuthority,
      remotePublicationExpected: expectsRemote
    }
  };
}

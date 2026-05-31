import type { CanonicalStateHead } from "../../../contracts/canonical-state-sync-backend.js";
import type { CanonicalStateSyncBackend } from "./canonical-state-sync-backend.js";
import { LOCAL_ONLY_BACKEND_ID, localOnlyDiagnostics } from "./local-only-backend.js";

export const LOCAL_ONLY_SYNC_STATUS_SCHEMA_VERSION = 1 as const;

export type LocalOnlySyncStatusV1 = {
  schemaVersion: typeof LOCAL_ONLY_SYNC_STATUS_SCHEMA_VERSION;
  backendId: typeof LOCAL_ONLY_BACKEND_ID;
  /** Explicit operator-facing mode — always local-only for this backend. */
  syncState: "local-only";
  mode: typeof LOCAL_ONLY_BACKEND_ID;
  message: string;
  gitRequired: false;
  remotePublication: false;
  head: CanonicalStateHead | null;
  eventCount: number;
  diagnostics: ReturnType<typeof localOnlyDiagnostics>;
};

export async function buildLocalOnlySyncStatus(
  backend: CanonicalStateSyncBackend,
  eventCount = 0
): Promise<LocalOnlySyncStatusV1> {
  const headResult = await backend.readHead();
  const head =
    headResult && typeof headResult === "object" && "ok" in headResult && headResult.ok === false
      ? null
      : (headResult as CanonicalStateHead);
  return {
    schemaVersion: LOCAL_ONLY_SYNC_STATUS_SCHEMA_VERSION,
    backendId: LOCAL_ONLY_BACKEND_ID,
    syncState: "local-only",
    mode: LOCAL_ONLY_BACKEND_ID,
    message:
      "Canonical events are stored locally only; no Git repository or remote publication is required.",
    gitRequired: false,
    remotePublication: false,
    head,
    eventCount,
    diagnostics: localOnlyDiagnostics({ eventCount })
  };
}

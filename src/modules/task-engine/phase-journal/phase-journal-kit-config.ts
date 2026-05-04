/** Reads optional kit.phaseJournal policy flags from effective workspace config. */

export type PhaseJournalKitPolicy = {
  /** When true, dismiss/supersede of active critical notes require JSON `policyApproval`. */
  requirePolicyApprovalForCriticalDismissSupersede: boolean;
};

export function readPhaseJournalKitPolicy(effective: Record<string, unknown> | undefined): PhaseJournalKitPolicy {
  const kit = effective?.kit;
  if (!kit || typeof kit !== "object" || kit === null || Array.isArray(kit)) {
    return { requirePolicyApprovalForCriticalDismissSupersede: false };
  }
  const pj = (kit as Record<string, unknown>).phaseJournal;
  if (!pj || typeof pj !== "object" || pj === null || Array.isArray(pj)) {
    return { requirePolicyApprovalForCriticalDismissSupersede: false };
  }
  const flag = (pj as Record<string, unknown>).requirePolicyApprovalForCriticalDismissSupersede;
  return { requirePolicyApprovalForCriticalDismissSupersede: flag === true };
}

/**
 * Enforcement-readiness contract for authored Guidance (T1005).
 * Preview + governance evidence gates — separate from Tier A/B policyApproval and CAE mutation approval.
 */

import type { DraftGuidanceRuleInputV1, GuidanceDraftImpactV1 } from "./guidance-draft-impact-preview.js";

/** Families that may ever participate in kit enforcement lanes (today: pilot allowlist only). */
export const CAE_ENFORCEMENT_CAPABLE_FAMILIES = ["policy"] as const;

/** Families that remain advisory / read / review surfaces for operator UX — never hard-stop via CAE pilot. */
export const CAE_ENFORCEMENT_ADVISORY_ONLY_FAMILIES = ["think", "do", "review"] as const;

export type GuidanceEnforcementConflictStatusV1 = "none" | "warning" | "blocking";

export type GovernanceEvidenceInputV1 = {
  schemaVersion: 1;
  registryMutationAuditId?: string;
  rollbackTargetVersionId?: string;
  actor?: string;
  rationale?: string;
};

export type GuidanceEnforcementReadinessV1 = {
  schemaVersion: 1;
  /** ISO timestamp when readiness was computed (caller-supplied, typically preview response time). */
  previewedAt: string;
  /** Short digest tying this row to draft overlay (prefix of registry digest snippet). */
  previewDigest: string;
  affectedScopeSummary: string;
  conflictStatus: GuidanceEnforcementConflictStatusV1;
  activationReadinessLevel: GuidanceDraftImpactV1["activationReadiness"]["level"];
  registryMutationAuditId: string | null;
  rollbackTargetVersionId: string | null;
  governanceActor: string | null;
  governanceRationale: string | null;
  /** `policy` only — think/do/review cannot be promoted to hard-stop enforcement. */
  familyHardStopCapable: boolean;
  /** Preview impact matrix + activation readiness allow moving to the governance (publish) step. */
  previewGatesSatisfied: boolean;
  /** Preview gates plus recorded CAE mutation audit, rollback target, actor, and rationale. */
  governanceEvidenceComplete: boolean;
  /** Stable machine codes (e.g. for tests and CLI). */
  blockingCodes: string[];
  /** Short operator-facing notes (deterministic order). */
  notes: string[];
};

function trimOrNull(s: unknown): string | null {
  if (typeof s !== "string") return null;
  const t = s.trim();
  return t.length > 0 ? t : null;
}

/**
 * Derive enforcement-readiness from a draft impact preview envelope.
 * `governance` is optional — supply after a successful CAE registry mutation to prove evidence alignment.
 */
export function computeGuidanceEnforcementReadiness(
  draftImpact: GuidanceDraftImpactV1,
  draftFamily: DraftGuidanceRuleInputV1["family"],
  previewedAtIso: string,
  governance?: GovernanceEvidenceInputV1 | null
): GuidanceEnforcementReadinessV1 {
  const ar = draftImpact.activationReadiness;
  const blockingCodes: string[] = [];
  const notes: string[] = [];

  const familyHardStopCapable = draftFamily === "policy";

  const hasBlockReason = ar.reasons.some((r) => r.severity === "block");
  const scopeErrors = draftImpact.scopeErrors?.length ?? 0;

  let conflictStatus: GuidanceEnforcementConflictStatusV1 = "none";
  if (ar.level === "stop_confirm" || hasBlockReason) {
    conflictStatus = "blocking";
  } else if (
    ar.conflictEntryCount > 0 ||
    ar.conflictsInvolvingDraft > 0 ||
    draftImpact.broadScopeWarnings.length > 0
  ) {
    conflictStatus = "warning";
  }

  if (!familyHardStopCapable) {
    blockingCodes.push("cae-enforce-family-advisory-only");
    notes.push(
      `Family "${draftFamily}" is advisory/read-only for hard-stop enforcement; only ${CAE_ENFORCEMENT_CAPABLE_FAMILIES.join("/")} may be considered for enforcement lanes (subject to kit.cae.enforcement.enabled + allowlist).`
    );
  }

  if (scopeErrors > 0) {
    blockingCodes.push("cae-enforce-draft-scope-errors");
    notes.push("Draft scope has validation errors; fix scope before any enforcement discussion.");
  }

  if (ar.level === "stop_confirm") {
    blockingCodes.push("cae-enforce-activation-stop-confirm");
    notes.push("Activation readiness is stop_confirm — resolve broad scope, conflicts, or always-on policy posture before publishing.");
  }

  if (hasBlockReason) {
    blockingCodes.push("cae-enforce-readiness-block-reason");
  }

  const previewGatesSatisfied =
    familyHardStopCapable &&
    scopeErrors === 0 &&
    ar.level !== "stop_confirm" &&
    !hasBlockReason;

  const gov = governance && governance.schemaVersion === 1 ? governance : undefined;
  const registryMutationAuditId = trimOrNull(gov?.registryMutationAuditId);
  const rollbackTargetVersionId = trimOrNull(gov?.rollbackTargetVersionId);
  const governanceActor = trimOrNull(gov?.actor);
  const governanceRationale = trimOrNull(gov?.rationale);

  const governanceEvidenceComplete =
    previewGatesSatisfied &&
    registryMutationAuditId !== null &&
    rollbackTargetVersionId !== null &&
    governanceActor !== null &&
    governanceRationale !== null;

  if (previewGatesSatisfied && !governanceEvidenceComplete) {
    blockingCodes.push("cae-enforce-governance-evidence-incomplete");
    notes.push(
      "Hard-stop promotion requires a successful CAE registry mutation audit id, explicit rollback target version id, actor, and rationale (caeMutationApproval is not policyApproval)."
    );
  }

  if (governanceEvidenceComplete) {
    notes.push(
      "Governance evidence fields are present; live blocking still requires kit.cae.enforcement.enabled and an allowlisted command match — see .ai/runbooks/cae-enforcement-readiness.md."
    );
  }

  const digestSrc = draftImpact.overlayRegistryDigestSnippet.trim();
  const previewDigest =
    digestSrc.length > 0 ? digestSrc.slice(0, 24) : `preset:${draftImpact.scopePreset}`;

  // De-dupe blocking codes
  const codes = [...new Set(blockingCodes)].sort();

  return {
    schemaVersion: 1,
    previewedAt: previewedAtIso,
    previewDigest,
    affectedScopeSummary: draftImpact.scopePlainSummary,
    conflictStatus,
    activationReadinessLevel: ar.level,
    registryMutationAuditId,
    rollbackTargetVersionId,
    governanceActor,
    governanceRationale,
    familyHardStopCapable,
    previewGatesSatisfied,
    governanceEvidenceComplete,
    blockingCodes: codes,
    notes: [...new Set(notes)]
  };
}

/** Reject authoring payloads that try to sneak enforcement flags through draftRule without the governance workflow. */
export function assertDraftRuleHasNoEnforcementFlags(raw: Record<string, unknown>): {
  ok: true;
} | { ok: false; code: string; message: string } {
  const banned = [
    "enforcement",
    "enforcementMode",
    "hardStop",
    "hard_stop",
    "blockingEnforcement",
    "enforceBlocking",
    "enforcementEligibility"
  ];
  for (const key of banned) {
    if (key in raw && raw[key] !== undefined && raw[key] !== null) {
      return {
        ok: false,
        code: "cae-enforce-draft-flag-forbidden",
        message: `draftRule must not set "${key}" here — enforcement promotion is gated by impact preview + governance evidence (.ai/runbooks/cae-enforcement-readiness.md).`
      };
    }
  }
  return { ok: true };
}

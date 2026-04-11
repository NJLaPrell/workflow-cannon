/**
 * CAE registry SQLite mutation gate — Epic 5 E1/E2 (separate from Tier A/B `policyApproval`).
 * Mutating `cae-*` registry admin commands are `policySensitivity: non-sensitive` at the global
 * policy layer; this module enforces CAE-specific preconditions + `caeMutationApproval` JSON.
 */

import type { ModuleCommandResult } from "../../contracts/module-contract.js";
import { getAtPath } from "../workspace-kit-config.js";

export type CaeMutationApproval = { confirmed: true; rationale: string };

export function parseCaeMutationApproval(args: Record<string, unknown>): CaeMutationApproval | null {
  const raw = args.caeMutationApproval;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const o = raw as Record<string, unknown>;
  if (o.confirmed !== true) return null;
  const rationale = typeof o.rationale === "string" ? o.rationale.trim() : "";
  if (!rationale) return null;
  return { confirmed: true, rationale };
}

/**
 * Returns `null` when mutation is allowed; otherwise a structured command error.
 */
export function caeRegistryMutationGateError(
  effective: Record<string, unknown>,
  args: Record<string, unknown>
): ModuleCommandResult | null {
  if (getAtPath(effective, "kit.cae.enabled") !== true) {
    return {
      ok: false,
      code: "cae-mutation-disabled",
      message: "CAE registry mutations require kit.cae.enabled === true"
    };
  }
  if (getAtPath(effective, "kit.cae.registryStore") === "json") {
    return {
      ok: false,
      code: "cae-mutation-json-store",
      message: "CAE registry mutations require kit.cae.registryStore === sqlite (json store is read-only seed)"
    };
  }
  if (getAtPath(effective, "kit.cae.adminMutations") !== true) {
    return {
      ok: false,
      code: "cae-mutation-admin-off",
      message: "CAE registry admin mutations require kit.cae.adminMutations === true (break-glass operator flag)"
    };
  }
  const approval = parseCaeMutationApproval(args);
  if (!approval) {
    return {
      ok: false,
      code: "cae-mutation-approval-missing",
      message:
        "Pass caeMutationApproval: { \"confirmed\": true, \"rationale\": \"…\" } (CAE governance lane — not policyApproval)"
    };
  }
  return null;
}

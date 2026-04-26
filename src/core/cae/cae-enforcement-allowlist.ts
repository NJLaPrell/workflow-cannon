/**
 * CAE enforcement allowlist — enumerated blocks only (`.ai/cae/enforcement-lane.md`).
 */

export type CaeEnforcementBlockRow = {
  id: string;
  /** Exact `wk run` subcommand name after alias resolution. */
  commandNameExact: string;
  /** When set, block only if this predicate returns true for the effective bundle. */
  whenBundle?: (bundle: Record<string, unknown>) => boolean;
};

/**
 * Pilot: block `enable-plugin` when phase-70 policy activation is present in the effective bundle.
 * Enforcement remains opt-in via `kit.cae.enforcement.enabled`.
 */
export const CAE_ENFORCEMENT_BLOCK_ALLOWLIST: readonly CaeEnforcementBlockRow[] = [
  {
    id: "pilot-enable-plugin-when-phase70-policy-activation",
    commandNameExact: "enable-plugin",
    whenBundle: (bundle) => {
      const fam = bundle.families as { policy?: Array<{ activationId?: string }> } | undefined;
      return (fam?.policy ?? []).some((p) => p.activationId === "cae.activation.policy.phase70-playbook");
    }
  }
];

export function findCaeEnforcementBlock(
  commandName: string,
  bundle: Record<string, unknown>
): CaeEnforcementBlockRow | null {
  for (const row of CAE_ENFORCEMENT_BLOCK_ALLOWLIST) {
    if (row.commandNameExact !== commandName) continue;
    if (row.whenBundle) {
      if (row.whenBundle(bundle)) return row;
    } else {
      return row;
    }
  }
  return null;
}

/**
 * Builtin seed for the wc-bug-reporter subagent definition.
 * Register via `seed-wc-bug-reporter` or by passing {@link buildWcBugReporterRegisterArgs}
 * into `register-subagent`.
 */

export const WC_BUG_REPORTER_SUBAGENT_ID = "wc-bug-reporter" as const;

/** Default child model pin (cheap_fast / composer-2.5). */
export const WC_BUG_REPORTER_PREFERRED_MODEL = "composer-2.5" as const;

export const WC_BUG_REPORTER_MODEL_TIER = "cheap_fast" as const;

/**
 * Allowed kit commands for the bug-reporter child.
 * Centered on `file-bug-report`; thin-handoff escalate + related-task crumb reads are optional.
 */
export const WC_BUG_REPORTER_ALLOWED_COMMANDS = [
  "file-bug-report",
  "recommend-model",
  "get-task"
] as const;

export type WcBugReporterSeedDefinition = {
  subagentId: typeof WC_BUG_REPORTER_SUBAGENT_ID;
  displayName: string;
  description: string;
  allowedCommands: string[];
  metadata: {
    schemaVersion: 1;
    skillId: "wc-bug-report";
    modelTier: typeof WC_BUG_REPORTER_MODEL_TIER;
    preferredModel: typeof WC_BUG_REPORTER_PREFERRED_MODEL;
    role: "bug-reporter";
    fireAndForget: true;
    filingCommand: "file-bug-report";
  };
};

/** Canonical module seed payload for `wc-bug-reporter`. */
export const WC_BUG_REPORTER_SEED: WcBugReporterSeedDefinition = {
  subagentId: WC_BUG_REPORTER_SUBAGENT_ID,
  displayName: "Workflow Cannon bug reporter",
  description:
    "Fire-and-forget bug-reporter child: bounded evidence enrichment then one file-bug-report (proposed improvement only). Default model composer-2.5; escalate via recommend-model on thin handoff.",
  allowedCommands: [...WC_BUG_REPORTER_ALLOWED_COMMANDS],
  metadata: {
    schemaVersion: 1,
    skillId: "wc-bug-report",
    modelTier: WC_BUG_REPORTER_MODEL_TIER,
    preferredModel: WC_BUG_REPORTER_PREFERRED_MODEL,
    role: "bug-reporter",
    fireAndForget: true,
    filingCommand: "file-bug-report"
  }
};

/**
 * Args suitable for `workspace-kit run register-subagent` (plus policy fields supplied by caller).
 */
export function buildWcBugReporterRegisterArgs(overrides?: {
  expectedPlanningGeneration?: number;
}): {
  subagentId: string;
  displayName: string;
  description: string;
  allowedCommands: string[];
  metadata: Record<string, unknown>;
  expectedPlanningGeneration?: number;
} {
  const args = {
    subagentId: WC_BUG_REPORTER_SEED.subagentId,
    displayName: WC_BUG_REPORTER_SEED.displayName,
    description: WC_BUG_REPORTER_SEED.description,
    allowedCommands: [...WC_BUG_REPORTER_SEED.allowedCommands],
    metadata: { ...WC_BUG_REPORTER_SEED.metadata }
  };
  if (overrides?.expectedPlanningGeneration !== undefined) {
    return { ...args, expectedPlanningGeneration: overrides.expectedPlanningGeneration };
  }
  return args;
}

export type SeedWcBugReporterResult = {
  seed: typeof WC_BUG_REPORTER_SEED;
  registerArgs: ReturnType<typeof buildWcBugReporterRegisterArgs>;
  registerInvocation: {
    name: "register-subagent";
    args: ReturnType<typeof buildWcBugReporterRegisterArgs>;
  };
};

export function buildSeedWcBugReporterPayload(
  expectedPlanningGeneration?: number
): SeedWcBugReporterResult {
  const registerArgs = buildWcBugReporterRegisterArgs(
    expectedPlanningGeneration !== undefined ? { expectedPlanningGeneration } : undefined
  );
  return {
    seed: WC_BUG_REPORTER_SEED,
    registerArgs,
    registerInvocation: {
      name: "register-subagent",
      args: registerArgs
    }
  };
}

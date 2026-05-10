import {
  appendPolicyTrace,
  parsePolicyApprovalFromEnv,
  resolveActorWithFallback,
  type PolicyOperationId
} from "../core/policy.js";
import { generateProfileDrivenArtifacts, validateProfile } from "./profile-support.js";

const EXIT_VALIDATION_FAILURE = 1;

async function requireCliPolicyApproval(
  cwd: string,
  operationId: PolicyOperationId,
  commandLabel: string,
  writeError: (message: string) => void
): Promise<{ rationale: string } | null> {
  const approval = parsePolicyApprovalFromEnv(process.env);
  if (!approval) {
    writeError(
      `workspace-kit ${commandLabel} (${operationId}) requires WORKSPACE_KIT_POLICY_APPROVAL with JSON {"confirmed":true,"rationale":"..."} (env lane). Sensitive workspace-kit run commands use JSON policyApproval instead — see docs/maintainers/POLICY-APPROVAL.md.`
    );
    await appendPolicyTrace(cwd, {
      timestamp: new Date().toISOString(),
      operationId,
      command: commandLabel,
      actor: await resolveActorWithFallback(cwd, {}, process.env),
      allowed: false,
      message: "missing WORKSPACE_KIT_POLICY_APPROVAL"
    });
    return null;
  }
  return { rationale: approval.rationale };
}

async function recordCliPolicySuccess(
  cwd: string,
  operationId: PolicyOperationId,
  commandLabel: string,
  rationale: string,
  commandOk: boolean
): Promise<void> {
  await appendPolicyTrace(cwd, {
    timestamp: new Date().toISOString(),
    operationId,
    command: commandLabel,
    actor: await resolveActorWithFallback(cwd, {}, process.env),
    allowed: true,
    rationale,
    commandOk
  });
}

/**
 * Legacy `workspace-kit init` behavior: validate profile and regenerate profile-driven artifacts only.
 */
export async function runRefreshContextCommand(
  cwd: string,
  writeLine: (message: string) => void,
  writeError: (message: string) => void
): Promise<number> {
  const approval = await requireCliPolicyApproval(cwd, "cli.init", "refresh-context", writeError);
  if (!approval) {
    return EXIT_VALIDATION_FAILURE;
  }

  const { errors, profile } = await validateProfile(cwd);
  if (errors.length > 0 || !profile) {
    await recordCliPolicySuccess(cwd, "cli.init", "refresh-context", approval.rationale, false);
    writeError("workspace-kit refresh-context failed profile validation.");
    for (const error of errors) {
      writeError(`- ${error}`);
    }
    return EXIT_VALIDATION_FAILURE;
  }

  const artifacts = await generateProfileDrivenArtifacts(cwd, profile);
  writeLine("workspace-kit refresh-context regenerated profile-driven project context artifacts.");
  writeLine(`- ${artifacts.generatedJsonPath}`);
  writeLine(`- ${artifacts.generatedRulePath}`);
  await recordCliPolicySuccess(cwd, "cli.init", "refresh-context", approval.rationale, true);
  return 0;
}

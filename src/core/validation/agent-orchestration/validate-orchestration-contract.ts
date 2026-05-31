import type { AgentActivityV1 } from "../../../contracts/agent-activity.v1.js";
import type { AgentDefinitionV1 } from "../../../contracts/agent-orchestration.js";
import type { AgentSessionV1 } from "../../../contracts/agent-session.v1.js";
import type { TeamAssignmentMetadataV1 } from "../../../contracts/team-execution-assignment-metadata.v1.js";
import type { TeamExecutionHandoffV2 } from "../../../contracts/team-execution-handoff.v2.js";
import { TEAM_EXECUTION_HANDOFF_SCHEMA_VERSION } from "../../../contracts/team-execution-handoff.v2.js";
import { getOrchestrationSchemaValidator } from "./ajv-registry.js";
import { collectUnknownCapabilityWarnings } from "./capability-advisories.js";
import {
  failureFromIssues,
  mapAjvErrorsToIssues,
  nonObjectRootFailure
} from "./map-ajv-errors.js";
import type {
  AgentActivityValidationResult,
  AgentDefinitionValidationResult,
  AgentSessionValidationResult,
  AssignmentMetadataValidationResult,
  HandoffV2ValidationResult,
  OrchestrationValidationIssue,
  OrchestrationValidationOptions
} from "./types.js";

function validateWithSchema<T>(
  input: unknown,
  schemaKey: Parameters<typeof getOrchestrationSchemaValidator>[0],
  contractLabel: string,
  options?: { handoffV2?: boolean; postValidate?: (data: T) => OrchestrationValidationIssue[] }
): { ok: true; data: T; warnings?: OrchestrationValidationIssue[] } | ReturnType<typeof failureFromIssues> {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return nonObjectRootFailure(contractLabel, input === null ? "null" : typeof input);
  }

  const validate = getOrchestrationSchemaValidator(schemaKey);
  if (!validate(input)) {
    const issues = mapAjvErrorsToIssues(validate.errors, {
      contractLabel,
      handoffV2: options?.handoffV2
    });
    return failureFromIssues(
      issues[0]?.code ?? "invalid-orchestration-schema",
      `${contractLabel} validation failed with ${issues.length} issue(s). Fix the reported fields and retry.`,
      issues
    );
  }

  const data = input as T;
  const postIssues = options?.postValidate?.(data) ?? [];
  const errors = postIssues.filter((i) => i.severity === "error");
  if (errors.length > 0) {
    return failureFromIssues(
      errors[0]?.code ?? "missing-required-orchestration-field",
      `${contractLabel} strict validation failed.`,
      errors
    );
  }

  const warnings = postIssues.filter((i) => i.severity === "warning");
  return warnings.length > 0 ? { ok: true, data, warnings } : { ok: true, data };
}

export function validateAgentDefinitionV1(
  input: unknown,
  _options?: OrchestrationValidationOptions
): AgentDefinitionValidationResult {
  const result = validateWithSchema<AgentDefinitionV1>(input, "agent-definition.v1", "AgentDefinition v1");
  if (!result.ok) {
    return result;
  }
  const capabilityWarnings = collectUnknownCapabilityWarnings(result.data);
  const warnings = [...(result.warnings ?? []), ...capabilityWarnings];
  return warnings.length > 0 ? { ok: true, data: result.data, warnings } : { ok: true, data: result.data };
}

export function validateAgentSessionV1(
  input: unknown,
  _options?: OrchestrationValidationOptions
): AgentSessionValidationResult {
  return validateWithSchema<AgentSessionV1>(input, "agent-session.v1", "AgentSession v1");
}

export function validateAssignmentMetadataV1(
  input: unknown,
  options?: OrchestrationValidationOptions
): AssignmentMetadataValidationResult {
  return validateWithSchema<TeamAssignmentMetadataV1>(
    input,
    "assignment-metadata.v1",
    "TeamAssignment metadata v1",
    {
      postValidate: (data) => {
        if (!options?.strict) {
          return [];
        }
        const owned =
          (Array.isArray(data.ownedPaths) && data.ownedPaths.length > 0) ||
          (data.resources &&
            typeof data.resources === "object" &&
            Array.isArray(data.resources.ownedPaths) &&
            data.resources.ownedPaths.length > 0);
        if (owned) {
          return [];
        }
        return [
          {
            code: "missing-required-orchestration-field",
            path: "/ownedPaths",
            message:
              "Strict mode requires 'ownedPaths' (or resources.ownedPaths) so the worker scope is bounded. Add path globs the worker may modify.",
            severity: "error"
          }
        ];
      }
    }
  );
}

export function validateAgentActivityV1(
  input: unknown,
  _options?: OrchestrationValidationOptions
): AgentActivityValidationResult {
  return validateWithSchema<AgentActivityV1>(input, "agent-activity.v1", "AgentActivity v1");
}

export function validateHandoffV2(
  input: unknown,
  _options?: OrchestrationValidationOptions
): HandoffV2ValidationResult {
  if (input !== null && typeof input === "object" && !Array.isArray(input)) {
    const version = (input as Record<string, unknown>).schemaVersion;
    if (version !== TEAM_EXECUTION_HANDOFF_SCHEMA_VERSION) {
      return failureFromIssues(
        "invalid-handoff-schema-version",
        "Handoff payload must set schemaVersion to 2 for Handoff v2 validation.",
        [
          {
            code: "invalid-handoff-schema-version",
            path: "/schemaVersion",
            message: `Expected schemaVersion ${TEAM_EXECUTION_HANDOFF_SCHEMA_VERSION}; got ${String(version)}.`,
            severity: "error"
          }
        ]
      );
    }
  }

  return validateWithSchema<TeamExecutionHandoffV2>(input, "handoff.v2", "Handoff v2", {
    handoffV2: true
  });
}

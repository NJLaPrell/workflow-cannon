import type { ErrorObject } from "ajv";
import type { OrchestrationValidationCode, OrchestrationValidationIssue } from "./types.js";

export type AjvErrorContext = {
  contractLabel: string;
  handoffV2?: boolean;
};

function pathLabel(instancePath: string | undefined): string {
  return instancePath && instancePath.length > 0 ? instancePath : "(root)";
}

function missingFieldCode(ctx: AjvErrorContext): OrchestrationValidationCode {
  return ctx.handoffV2 ? "handoff-v2-missing-field" : "missing-required-orchestration-field";
}

function formatAllowedEnum(params: ErrorObject["params"]): string {
  const allowed = (params as { allowedValues?: unknown[] }).allowedValues;
  if (Array.isArray(allowed) && allowed.length > 0) {
    return allowed.map(String).join(", ");
  }
  return "see schema";
}

export function mapAjvErrorsToIssues(
  errors: ErrorObject[] | null | undefined,
  ctx: AjvErrorContext
): OrchestrationValidationIssue[] {
  if (!errors?.length) {
    return [
      {
        code: "invalid-orchestration-schema",
        path: "(root)",
        message: `${ctx.contractLabel} failed JSON Schema validation.`,
        severity: "error"
      }
    ];
  }

  return errors.map((error) => {
    const path = pathLabel(error.instancePath);
    const params = error.params ?? {};

    if (error.keyword === "additionalProperties") {
      const prop =
        typeof (params as { additionalProperty?: unknown }).additionalProperty === "string"
          ? (params as { additionalProperty: string }).additionalProperty
          : "unknown";
      return {
        code: "unknown-orchestration-field",
        path: path === "(root)" ? `/${prop}` : `${path}/${prop}`,
        message: `Unknown field '${prop}' is not allowed on ${ctx.contractLabel}. Remove it or move extension data into 'metadata' / 'details' where permitted.`,
        severity: "error"
      };
    }

    if (error.keyword === "required") {
      const missing =
        typeof (params as { missingProperty?: unknown }).missingProperty === "string"
          ? (params as { missingProperty: string }).missingProperty
          : "field";
      return {
        code: missingFieldCode(ctx),
        path,
        message: `Required field '${missing}' is missing on ${ctx.contractLabel}. Add '${missing}' before submitting.`,
        severity: "error"
      };
    }

    if (error.keyword === "enum") {
      return {
        code: "invalid-orchestration-enum",
        path,
        message: `Invalid enum value at ${path} on ${ctx.contractLabel}. Allowed values: ${formatAllowedEnum(params)}.`,
        severity: "error"
      };
    }

    if (ctx.handoffV2 && path.endsWith("/summary") && (error.keyword === "minLength" || error.keyword === "type")) {
      return {
        code: "handoff-v2-missing-field",
        path,
        message: "Handoff v2 requires a non-empty 'summary'. Provide a concise outcome summary for the orchestrator.",
        severity: "error"
      };
    }

    const detail = error.message ?? error.keyword ?? "validation error";
    return {
      code: "invalid-orchestration-schema",
      path,
      message: `${ctx.contractLabel} invalid at ${path}: ${detail}.`,
      severity: "error"
    };
  });
}

export function failureFromIssues(
  code: OrchestrationValidationCode,
  message: string,
  issues: OrchestrationValidationIssue[]
): { ok: false; code: OrchestrationValidationCode; message: string; issues: OrchestrationValidationIssue[] } {
  return { ok: false, code, message, issues };
}

export function nonObjectRootFailure(
  contractLabel: string,
  receivedType: string
): OrchestrationValidationFailureShape {
  return failureFromIssues("invalid-orchestration-schema", `${contractLabel} must be a JSON object.`, [
    {
      code: "invalid-orchestration-schema",
      path: "(root)",
      message: `Expected an object root for ${contractLabel}; got ${receivedType}.`,
      severity: "error"
    }
  ]);
}

type OrchestrationValidationFailureShape = ReturnType<typeof failureFromIssues>;

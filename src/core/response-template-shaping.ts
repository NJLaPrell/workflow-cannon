import type {
  ModuleCommandResult,
  ResponseTemplateApplicationMeta
} from "../contracts/module-contract.js";
import {
  type ResponseTemplateEnforcementMode,
  truncateTemplateWarning
} from "./response-template-contract.js";
import { getResponseTemplateDefinition } from "./response-template-registry.js";
import { parseTemplateDirectiveFromText } from "./instruction-template-mapper.js";

function readResponseTemplatesConfig(
  effective: Record<string, unknown>
): {
  enforcementMode: ResponseTemplateEnforcementMode;
  defaultTemplateId: string | null;
  commandOverrides: Record<string, string>;
} {
  const rt = effective.responseTemplates;
  if (!rt || typeof rt !== "object" || Array.isArray(rt)) {
    return { enforcementMode: "advisory", defaultTemplateId: "default", commandOverrides: {} };
  }
  const o = rt as Record<string, unknown>;
  const modeRaw = o.enforcementMode;
  const enforcementMode: ResponseTemplateEnforcementMode =
    modeRaw === "strict" ? "strict" : "advisory";
  const defRaw = o.defaultTemplateId;
  const def =
    typeof defRaw === "string" && defRaw.trim().length > 0 ? defRaw.trim() : "default";
  const commandOverrides: Record<string, string> = {};
  const co = o.commandOverrides;
  if (co && typeof co === "object" && !Array.isArray(co)) {
    for (const [k, v] of Object.entries(co)) {
      if (typeof v === "string" && v.trim()) {
        commandOverrides[k.trim()] = v.trim();
      }
    }
  }
  return { enforcementMode, defaultTemplateId: def, commandOverrides };
}

function resolveRequestedTemplateId(
  commandName: string,
  args: Record<string, unknown>
): { templateId: string | null; parseWarnings: string[] } {
  const parseWarnings: string[] = [];
  const explicit =
    typeof args.responseTemplateId === "string" && args.responseTemplateId.trim()
      ? args.responseTemplateId.trim()
      : null;

  const directiveSources = [
    typeof args.responseTemplateDirective === "string" ? args.responseTemplateDirective : "",
    typeof args.instructionTemplateDirective === "string" ? args.instructionTemplateDirective : "",
    typeof args.instruction === "string" ? args.instruction : ""
  ].filter(Boolean);

  let fromText: string | null = null;
  for (const src of directiveSources) {
    const parsed = parseTemplateDirectiveFromText(src);
    parseWarnings.push(...parsed.warnings);
    if (parsed.templateId) {
      fromText = parsed.templateId;
      break;
    }
  }

  if (explicit && fromText && explicit !== fromText) {
    parseWarnings.push(
      truncateTemplateWarning(
        `responseTemplateId '${explicit}' disagrees with instruction directive '${fromText}'; using explicit id.`
      )
    );
  }

  if (explicit) return { templateId: explicit, parseWarnings };
  if (fromText) return { templateId: fromText, parseWarnings };
  return { templateId: null, parseWarnings };
}

function attachPresentation(
  templateId: string,
  result: ModuleCommandResult
): Record<string, unknown> | undefined {
  const def = getResponseTemplateDefinition(templateId);
  if (!def || !result.data || typeof result.data !== "object" || Array.isArray(result.data)) {
    return undefined;
  }
  const data = result.data as Record<string, unknown>;
  const matchedSections = def.expectedSections.filter((k) => k in data);
  return {
    templateId: def.id,
    matchedSections
  };
}

function buildMeta(
  partial: Omit<ResponseTemplateApplicationMeta, "telemetry"> & { telemetry?: ResponseTemplateApplicationMeta["telemetry"] },
  startNs: bigint
): ResponseTemplateApplicationMeta {
  const warningCount = partial.warnings.length;
  return {
    ...partial,
    telemetry: {
      resolveNs: Number(process.hrtime.bigint() - startNs),
      warningCount
    }
  };
}

/**
 * Apply response template metadata and optional presentation hints (T262, T265).
 * Advisory mode never flips `ok`. Strict mode fails closed on unknown template ids when a template was explicitly requested or command override is set.
 */
export function applyResponseTemplateApplication(
  commandName: string,
  args: Record<string, unknown>,
  result: ModuleCommandResult,
  effective: Record<string, unknown>
): ModuleCommandResult {
  const startNs = process.hrtime.bigint();
  const cfg = readResponseTemplatesConfig(effective);
  const { templateId: requestedRaw, parseWarnings } = resolveRequestedTemplateId(commandName, args);
  const override = cfg.commandOverrides[commandName];
  const chosenId = requestedRaw ?? override ?? cfg.defaultTemplateId ?? "default";

  const warnings: string[] = [...parseWarnings];
  const def = getResponseTemplateDefinition(chosenId);

  if (!def) {
    warnings.push(truncateTemplateWarning(`Unknown response template '${chosenId}'.`));
    const explicitRequest = Boolean(requestedRaw || override);
    if (cfg.enforcementMode === "strict" && explicitRequest) {
      return {
        ...result,
        ok: false,
        code: "response-template-invalid",
        message: truncateTemplateWarning(`Unknown response template '${chosenId}'.`),
        responseTemplate: buildMeta(
          {
            requestedTemplateId: requestedRaw ?? override,
            appliedTemplateId: null,
            enforcementMode: cfg.enforcementMode,
            warnings
          },
          startNs
        )
      };
    }
    return {
      ...result,
      responseTemplate: buildMeta(
        {
          requestedTemplateId: requestedRaw ?? override ?? cfg.defaultTemplateId,
          appliedTemplateId: null,
          enforcementMode: cfg.enforcementMode,
          warnings
        },
        startNs
      )
    };
  }

  const presentation = attachPresentation(def.id, result);
  const nextData =
    presentation && result.data && typeof result.data === "object" && !Array.isArray(result.data)
      ? { ...(result.data as Record<string, unknown>), presentation }
      : result.data;

  return {
    ...result,
    data: nextData,
    responseTemplate: buildMeta(
      {
        requestedTemplateId: requestedRaw ?? override ?? cfg.defaultTemplateId,
        appliedTemplateId: def.id,
        enforcementMode: cfg.enforcementMode,
        warnings
      },
      startNs
    )
  };
}

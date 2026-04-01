import type {
  ModuleCommandResult,
  ResponseTemplateApplicationMeta
} from "../contracts/module-contract.js";
import {
  type ResponseTemplateEnforcementMode,
  truncateTemplateWarning
} from "./response-template-contract.js";
import { getResponseTemplateDefinition } from "./response-template-registry.js";
import { getBuiltinCommandDefaultTemplateId } from "../contracts/builtin-run-command-manifest.js";
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

type DirectiveFieldName = "responseTemplateDirective" | "instructionTemplateDirective" | "instruction";

function resolveRequestedTemplateId(
  _commandName: string,
  args: Record<string, unknown>
): {
  templateId: string | null;
  directiveField: DirectiveFieldName | null;
  parseWarnings: string[];
  strictViolations: string[];
} {
  const parseWarnings: string[] = [];
  const strictViolations: string[] = [];
  const explicit =
    typeof args.responseTemplateId === "string" && args.responseTemplateId.trim()
      ? args.responseTemplateId.trim()
      : null;

  const directiveSources: { field: DirectiveFieldName; text: string }[] = [
    {
      field: "responseTemplateDirective",
      text: typeof args.responseTemplateDirective === "string" ? args.responseTemplateDirective : ""
    },
    {
      field: "instructionTemplateDirective",
      text: typeof args.instructionTemplateDirective === "string" ? args.instructionTemplateDirective : ""
    },
    { field: "instruction", text: typeof args.instruction === "string" ? args.instruction : "" }
  ];

  let fromText: string | null = null;
  let directiveField: DirectiveFieldName | null = null;
  for (const { field, text } of directiveSources) {
    if (!text) continue;
    const parsed = parseTemplateDirectiveFromText(text);
    parseWarnings.push(...parsed.warnings);
    if (parsed.templateId) {
      fromText = parsed.templateId;
      directiveField = field;
      break;
    }
  }

  if (explicit && fromText && explicit !== fromText) {
    const fieldLabel = directiveField ?? "plain-English directive";
    parseWarnings.push(
      truncateTemplateWarning(
        `responseTemplateId '${explicit}' disagrees with ${fieldLabel} (parsed id '${fromText}'); using explicit id.`
      )
    );
    strictViolations.push(
      truncateTemplateWarning(
        `Strict mode: JSON responseTemplateId '${explicit}' conflicts with \`${fieldLabel}\` (parsed id '${fromText}'). Advisory mode would still apply the explicit id.`
      )
    );
  }

  if (explicit) return { templateId: explicit, directiveField, parseWarnings, strictViolations };
  if (fromText) return { templateId: fromText, directiveField, parseWarnings, strictViolations };
  return { templateId: null, directiveField: null, parseWarnings, strictViolations };
}

function describeTemplateResolutionSource(args: {
  commandName: string;
  args: Record<string, unknown>;
  requestedRaw: string | null;
  directiveField: DirectiveFieldName | null;
  override: string | undefined;
  manifestDefault: string | undefined;
  chosenId: string;
  cfgDefault: string;
}): string {
  const explicit = typeof args.args.responseTemplateId === "string" && args.args.responseTemplateId.trim();
  if (explicit) {
    return "JSON arg `responseTemplateId`";
  }
  if (args.directiveField) {
    return `plain-English \`${args.directiveField}\``;
  }
  if (args.override !== undefined && args.override === args.chosenId) {
    return `\`responseTemplates.commandOverrides['${args.commandName}']\``;
  }
  if (args.manifestDefault !== undefined && args.manifestDefault === args.chosenId) {
    return `builtin manifest defaultResponseTemplateId for \`${args.commandName}\``;
  }
  return `\`responseTemplates.defaultTemplateId\` (effective '${args.cfgDefault}')`;
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
 * Advisory mode never flips `ok` for template issues. Strict mode fails closed on unknown resolved template ids
 * (explicit, override, or default) and on explicit-vs-directive conflicts (`response-template-conflict`).
 */
export function applyResponseTemplateApplication(
  commandName: string,
  args: Record<string, unknown>,
  result: ModuleCommandResult,
  effective: Record<string, unknown>
): ModuleCommandResult {
  const startNs = process.hrtime.bigint();
  const cfg = readResponseTemplatesConfig(effective);
  const { templateId: requestedRaw, directiveField, parseWarnings, strictViolations } =
    resolveRequestedTemplateId(commandName, args);

  if (cfg.enforcementMode === "strict" && strictViolations.length > 0) {
    const warnings = [...parseWarnings, ...strictViolations];
    return {
      ...result,
      ok: false,
      code: "response-template-conflict",
      message: strictViolations[0]!,
      responseTemplate: buildMeta(
        {
          requestedTemplateId: requestedRaw,
          appliedTemplateId: null,
          enforcementMode: cfg.enforcementMode,
          warnings
        },
        startNs
      )
    };
  }

  const override = cfg.commandOverrides[commandName];
  const manifestDefault = getBuiltinCommandDefaultTemplateId(commandName);
  const chosenId = requestedRaw ?? override ?? manifestDefault ?? cfg.defaultTemplateId ?? "default";
  const requestedTemplateIdForMeta =
    requestedRaw ?? override ?? manifestDefault ?? cfg.defaultTemplateId ?? null;

  const resolutionSource = describeTemplateResolutionSource({
    commandName,
    args,
    requestedRaw,
    directiveField,
    override,
    manifestDefault,
    chosenId,
    cfgDefault: cfg.defaultTemplateId ?? "default"
  });

  const warnings: string[] = [...parseWarnings];
  const def = getResponseTemplateDefinition(chosenId);

  if (!def) {
    const unknownDetail = `Unknown response template '${chosenId}' (chosen by ${resolutionSource}).`;
    warnings.push(truncateTemplateWarning(unknownDetail));
    if (cfg.enforcementMode === "strict") {
      return {
        ...result,
        ok: false,
        code: "response-template-invalid",
        message: truncateTemplateWarning(unknownDetail),
        responseTemplate: buildMeta(
          {
            requestedTemplateId: requestedTemplateIdForMeta,
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
          requestedTemplateId: requestedTemplateIdForMeta,
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
        requestedTemplateId: requestedTemplateIdForMeta,
        appliedTemplateId: def.id,
        enforcementMode: cfg.enforcementMode,
        warnings
      },
      startNs
    )
  };
}

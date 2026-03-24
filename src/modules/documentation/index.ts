import type { WorkflowModule } from "../../contracts/module-contract.js";
import { generateDocument } from "./runtime.js";
export type {
  DocumentationConflict,
  DocumentationGenerateOptions,
  DocumentationGenerateResult,
  DocumentationGenerationEvidence,
  DocumentationValidationIssue
} from "./types.js";
import type { DocumentationGenerateOptions } from "./types.js";

export const documentationModule: WorkflowModule = {
  registration: {
    id: "documentation",
    version: "0.1.0",
    contractVersion: "1",
    capabilities: ["documentation"],
    dependsOn: [],
    enabledByDefault: true,
    config: {
      path: "src/modules/documentation/config.md",
      format: "md",
      description: "Documentation module configuration contract."
    },
    state: {
      path: "src/modules/documentation/state.md",
      format: "md",
      description: "Documentation module generation/runtime state contract."
    },
    instructions: {
      directory: "src/modules/documentation/instructions",
      entries: [
        {
          name: "document-project",
          file: "document-project.md",
          description: "Generate aligned project docs for .ai and docs surfaces."
        }
      ]
    }
  },
  async onCommand(command, ctx) {
    if (command.name !== "document-project" && command.name !== "generate-document") {
      return {
        ok: false,
        code: "unsupported-command",
        message: `Documentation module does not support command '${command.name}'`
      };
    }

    const args = command.args ?? {};
    const rawOptions: Record<string, unknown> | undefined =
      typeof args.options === "object" && args.options !== null
        ? (args.options as Record<string, unknown>)
        : undefined;
    const options: DocumentationGenerateOptions | undefined = rawOptions
      ? {
          dryRun: typeof rawOptions.dryRun === "boolean" ? rawOptions.dryRun : undefined,
          overwrite: typeof rawOptions.overwrite === "boolean" ? rawOptions.overwrite : undefined,
          strict: typeof rawOptions.strict === "boolean" ? rawOptions.strict : undefined,
          maxValidationAttempts:
            typeof rawOptions.maxValidationAttempts === "number"
              ? rawOptions.maxValidationAttempts
              : undefined,
          allowWithoutTemplate:
            typeof rawOptions.allowWithoutTemplate === "boolean"
              ? rawOptions.allowWithoutTemplate
              : undefined
        }
      : undefined;
    const result = await generateDocument(
      {
        documentType: typeof args.documentType === "string" ? args.documentType : undefined,
        options
      },
      ctx
    );

    return {
      ok: result.ok,
      code: result.ok ? "generated-document" : "generation-failed",
      message: result.ok
        ? `Generated document '${args.documentType ?? "unknown"}'`
        : `Failed to generate document '${args.documentType ?? "unknown"}'`,
      data: {
        aiOutputPath: result.aiOutputPath,
        humanOutputPath: result.humanOutputPath,
        evidence: result.evidence
      }
    };
  }
};

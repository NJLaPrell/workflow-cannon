import type { WorkflowModule } from "../../contracts/module-contract.js";
import { generateDocument, generateAllDocuments } from "./runtime.js";
export type {
  DocumentationBatchResult,
  DocumentationConflict,
  DocumentationGenerateOptions,
  DocumentationGenerateResult,
  DocumentationGenerationEvidence,
  DocumentationValidationIssue
} from "./types.js";
import type { DocumentationGenerateOptions } from "./types.js";

function parseOptions(raw: Record<string, unknown>): DocumentationGenerateOptions {
  return {
    dryRun: typeof raw.dryRun === "boolean" ? raw.dryRun : undefined,
    overwrite: typeof raw.overwrite === "boolean" ? raw.overwrite : undefined,
    overwriteAi: typeof raw.overwriteAi === "boolean" ? raw.overwriteAi : undefined,
    overwriteHuman: typeof raw.overwriteHuman === "boolean" ? raw.overwriteHuman : undefined,
    strict: typeof raw.strict === "boolean" ? raw.strict : undefined,
    maxValidationAttempts:
      typeof raw.maxValidationAttempts === "number" ? raw.maxValidationAttempts : undefined,
    allowWithoutTemplate:
      typeof raw.allowWithoutTemplate === "boolean" ? raw.allowWithoutTemplate : undefined,
  };
}

export const documentationModule: WorkflowModule = {
  registration: {
    id: "documentation",
    version: "0.2.0",
    contractVersion: "1",
    stateSchema: 1,
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
          description: "Generate all project docs from templates to .ai and docs/maintainers surfaces."
        },
        {
          name: "generate-document",
          file: "generate-document.md",
          description: "Generate a single document by type for .ai and docs/maintainers surfaces."
        }
      ]
    }
  },
  async onCommand(command, ctx) {
    const args = command.args ?? {};
    const rawOptions: Record<string, unknown> =
      typeof args.options === "object" && args.options !== null
        ? (args.options as Record<string, unknown>)
        : {};
    const options = parseOptions(rawOptions);

    const handlers: Record<string, () => Promise<{
      ok: boolean;
      code: string;
      message?: string;
      data?: Record<string, unknown>;
    }>> = {
      "document-project": async () => {
        const batchResult = await generateAllDocuments({ options }, ctx);
        return {
          ok: batchResult.ok,
          code: batchResult.ok ? "documented-project" : "documentation-batch-failed",
          message: batchResult.ok
            ? `Generated ${batchResult.summary.succeeded} documents (${batchResult.summary.skipped} skipped)`
            : `Batch failed: ${batchResult.summary.failed} of ${batchResult.summary.total} documents failed`,
          data: {
            summary: batchResult.summary,
            results: batchResult.results.map((r) => ({
              documentType: r.evidence.documentType,
              ok: r.ok,
              aiOutputPath: r.aiOutputPath,
              humanOutputPath: r.humanOutputPath,
              filesWritten: r.evidence.filesWritten,
              filesSkipped: r.evidence.filesSkipped
            }))
          }
        };
      },
      "generate-document": async () => {
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
    const handler = handlers[command.name];
    if (handler) return handler();

    return {
      ok: false,
      code: "unsupported-command",
      message: `Documentation module does not support command '${command.name}'`
    };
  }
};

import Ajv2020Import from "ajv/dist/2020.js";
import type { ValidateFunction } from "ajv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import agentActivitySchema from "../../../../schemas/agent-orchestration/agent-activity.v1.json" with {
  type: "json"
};
import agentDefinitionSchema from "../../../../schemas/agent-orchestration/agent-definition.v1.json" with {
  type: "json"
};
import agentSessionSchema from "../../../../schemas/agent-orchestration/agent-session.v1.json" with {
  type: "json"
};
import assignmentMetadataSchema from "../../../../schemas/agent-orchestration/assignment-metadata.v1.json" with {
  type: "json"
};
import handoffV2Schema from "../../../../schemas/agent-orchestration/handoff.v2.json" with { type: "json" };
import modelSelectionMapSchema from "../../../../schemas/agent-orchestration/model-selection-map.v1.json" with {
  type: "json"
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- ajv default export shape varies by bundler
const Ajv2020Ctor = (Ajv2020Import as any).default ?? Ajv2020Import;

export type OrchestrationSchemaKey =
  | "agent-definition.v1"
  | "agent-session.v1"
  | "assignment-metadata.v1"
  | "agent-activity.v1"
  | "handoff.v2"
  | "model-selection-map.v1";

const SCHEMA_IDS: Record<OrchestrationSchemaKey, string> = {
  "agent-definition.v1": agentDefinitionSchema.$id as string,
  "agent-session.v1": agentSessionSchema.$id as string,
  "assignment-metadata.v1": assignmentMetadataSchema.$id as string,
  "agent-activity.v1": agentActivitySchema.$id as string,
  "handoff.v2": handoffV2Schema.$id as string,
  "model-selection-map.v1": modelSelectionMapSchema.$id as string
};

let validators: Map<OrchestrationSchemaKey, ValidateFunction> | null = null;

function resolvePackageRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "../../../..");
}

export function resetOrchestrationValidationCache(): void {
  validators = null;
}

function getValidators(): Map<OrchestrationSchemaKey, ValidateFunction> {
  if (validators) {
    return validators;
  }
  const ajv = new Ajv2020Ctor({ strict: false, allErrors: true }) as {
    addSchema: (schema: object) => void;
    getSchema: (id: string) => ValidateFunction | undefined;
  };
  ajv.addSchema(agentDefinitionSchema as object);
  ajv.addSchema(agentSessionSchema as object);
  ajv.addSchema(assignmentMetadataSchema as object);
  ajv.addSchema(agentActivitySchema as object);
  ajv.addSchema(handoffV2Schema as object);
  ajv.addSchema(modelSelectionMapSchema as object);

  const map = new Map<OrchestrationSchemaKey, ValidateFunction>();
  for (const [key, id] of Object.entries(SCHEMA_IDS) as Array<[OrchestrationSchemaKey, string]>) {
    const validate = ajv.getSchema(id);
    if (!validate) {
      throw new Error(`Missing AJV schema for orchestration contract ${key} (${id})`);
    }
    map.set(key, validate);
  }
  validators = map;
  return map;
}

export function getOrchestrationSchemaValidator(key: OrchestrationSchemaKey): ValidateFunction {
  return getValidators().get(key)!;
}

export function orchestrationSchemasRoot(): string {
  return join(resolvePackageRoot(), "schemas", "agent-orchestration");
}

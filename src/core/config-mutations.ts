import fs from "node:fs/promises";
import path from "node:path";

export const CONFIG_MUTATIONS_SCHEMA_VERSION = 1 as const;

export type ConfigMutationRecord = {
  schemaVersion: typeof CONFIG_MUTATIONS_SCHEMA_VERSION;
  timestamp: string;
  actor: string;
  key: string;
  layer: "project" | "user";
  operation: "set" | "unset";
  ok: boolean;
  code?: string;
  message?: string;
  previousSummary?: string;
  nextSummary?: string;
};

const CONFIG_DIR = ".workspace-kit/config";
const MUTATIONS_FILE = "mutations.jsonl";

function summarizeValue(key: string, value: unknown): string {
  if (value === undefined) return "(unset)";
  if (key === "policy.extraSensitiveModuleCommands" && Array.isArray(value)) {
    return `array(len=${value.length})`;
  }
  if (typeof value === "string") {
    return `string(len=${value.length})`;
  }
  return typeof value;
}

export async function appendConfigMutation(
  workspacePath: string,
  record: Omit<ConfigMutationRecord, "schemaVersion"> & { schemaVersion?: number }
): Promise<void> {
  const dir = path.join(workspacePath, CONFIG_DIR);
  const fp = path.join(dir, MUTATIONS_FILE);
  const line = `${JSON.stringify({
    schemaVersion: CONFIG_MUTATIONS_SCHEMA_VERSION,
    ...record
  })}\n`;
  await fs.mkdir(dir, { recursive: true });
  await fs.appendFile(fp, line, "utf8");
}

export function summarizeForEvidence(
  key: string,
  sensitive: boolean,
  value: unknown
): string {
  if (sensitive) {
    return value === undefined ? "(unset)" : "(redacted)";
  }
  return summarizeValue(key, value);
}

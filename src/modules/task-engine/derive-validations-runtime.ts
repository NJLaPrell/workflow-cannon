import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { CLOSEOUT_VALIDATION_COMMANDS } from "./release-evidence-fragments.js";

export const DERIVE_VALIDATIONS_SCHEMA_VERSION = 1 as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeValidations(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(isRecord);
}

export function buildCanonicalCloseoutValidations(conclusion: string): Record<string, unknown>[] {
  return CLOSEOUT_VALIDATION_COMMANDS.map((command) => ({
    command,
    conclusion,
    source: "closeout-canonical"
  }));
}

export type DeriveValidationsFs = {
  exists?: (path: string) => boolean;
  readFile?: (path: string, encoding: BufferEncoding) => string;
};

export function deriveValidationsFragment(args: {
  phaseKey: string | null;
  gatesOutputPath?: string | null;
  conclusion?: string;
  fsImpl?: DeriveValidationsFs;
}): {
  schemaVersion: typeof DERIVE_VALIDATIONS_SCHEMA_VERSION;
  fragmentKind: "validations";
  phaseKey: string | null;
  validations: Record<string, unknown>[];
  source: string;
} {
  const fsImpl = args.fsImpl ?? {};
  const exists = fsImpl.exists ?? existsSync;
  const readFile = fsImpl.readFile ?? ((path: string, enc: BufferEncoding) => readFileSync(path, enc));
  const defaultConclusion = nonEmptyString(args.conclusion) ? args.conclusion.trim() : "success";

  if (args.gatesOutputPath && exists(args.gatesOutputPath)) {
    try {
      const parsed: unknown = JSON.parse(readFile(args.gatesOutputPath, "utf8"));
      if (isRecord(parsed) && Array.isArray(parsed.validations)) {
        const validations = normalizeValidations(parsed.validations);
        if (validations.length > 0) {
          return {
            schemaVersion: DERIVE_VALIDATIONS_SCHEMA_VERSION,
            fragmentKind: "validations",
            phaseKey: args.phaseKey,
            validations,
            source: `gates-output:${args.gatesOutputPath}`
          };
        }
      }
    } catch {
      // fall through to canonical list
    }
  }

  return {
    schemaVersion: DERIVE_VALIDATIONS_SCHEMA_VERSION,
    fragmentKind: "validations",
    phaseKey: args.phaseKey,
    validations: buildCanonicalCloseoutValidations(defaultConclusion),
    source: "closeout-canonical"
  };
}

export function defaultGatesOutputPath(workspacePath: string, releaseVersion: string): string {
  return join(workspacePath, ".workspace-kit", "release-evidence", releaseVersion, "validations.json");
}

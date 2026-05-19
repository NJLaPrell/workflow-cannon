import { CLI_REMEDIATION_DOCS } from "../core/cli-remediation.js";
import { cliDiscoveryEnvelope } from "../core/cli-discovery.js";
import { POLICY_APPROVAL_HUMAN_DOC } from "../core/policy.js";

/** Strip optional catalog flags before subcommand (machine catalog for bare `wk run` / list-commands). */
export function peelRunArgv(tail: string[]): {
  jsonCatalog: boolean;
  listCommands: boolean;
  outputFile?: string;
  rest: string[];
} {
  const rest: string[] = [];
  let jsonCatalog = false;
  let listCommands = false;
  let outputFile: string | undefined;
  let i = 0;
  while (i < tail.length) {
    const a = tail[i];
    if (a === "--output-file" && typeof tail[i + 1] === "string" && tail[i + 1].length > 0) {
      outputFile = tail[i + 1];
      i += 2;
      continue;
    }
    if (a.startsWith("--output-file=") && a.length > "--output-file=".length) {
      outputFile = a.slice("--output-file=".length);
      i += 1;
      continue;
    }
    if (a === "--list-commands") {
      listCommands = true;
      i += 1;
      continue;
    }
    if (a === "--json" || a === "-j") {
      jsonCatalog = true;
      i += 1;
      continue;
    }
    if (a === "--format" && tail[i + 1] === "json") {
      jsonCatalog = true;
      i += 2;
      continue;
    }
    if (a.startsWith("--format=") && a.slice("--format=".length) === "json") {
      jsonCatalog = true;
      i += 1;
      continue;
    }
    rest.push(a);
    i += 1;
  }
  if (listCommands) {
    jsonCatalog = true;
  }
  return { jsonCatalog, listCommands, outputFile, rest };
}

export function policyDeniedBody(params: {
  policyOp: string | null | undefined;
  message: string;
  hint: string;
  wrongEnvLane: boolean;
  subcommand: string;
  hasPolicyApprovalField: boolean;
}): Record<string, unknown> {
  const { policyOp, message, hint, wrongEnvLane, subcommand, hasPolicyApprovalField } = params;
  const sample = {
    policyApproval: { confirmed: true, rationale: "operator-approved sensitive run" }
  };
  return {
    ok: false,
    code: "policy-denied",
    operationId: policyOp ?? null,
    remediationDoc: POLICY_APPROVAL_HUMAN_DOC,
    remediation: {
      docPath: CLI_REMEDIATION_DOCS.policyApproval,
      instructionPath: "src/modules/task-engine/instructions/run-transition.md"
    },
    readCommandSuggestion: {
      command: subcommand,
      argvTemplateJson: sample,
      argvExample: `workspace-kit run ${subcommand} '${JSON.stringify(sample)}'`,
      schemaOnlyExample: `workspace-kit run ${subcommand} --schema-only '{}'`,
      snippetIndexHint: `.ai/agent-cli-snippets/by-command/${subcommand}.json`
    },
    message,
    hint,
    wrongEnvLane: wrongEnvLane || undefined,
    hasPolicyApprovalField: hasPolicyApprovalField || undefined,
    discovery: cliDiscoveryEnvelope()
  };
}

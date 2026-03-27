import { createInterface } from "node:readline/promises";

export type PolicyPromptIo = {
  writeError: (message: string) => void;
  readStdinLine?: () => Promise<string | null>;
};

/** Enable TTY interactive approval for sensitive `workspace-kit run` when truthy (`on`, `1`, `true`, `yes`). */
export function isInteractiveApprovalEnabled(env: NodeJS.ProcessEnv): boolean {
  const v = env.WORKSPACE_KIT_INTERACTIVE_APPROVAL?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "yes";
}

export type InteractiveApprovalChoice =
  | { kind: "deny" }
  | { kind: "approve"; scope: "once" | "session" };

function canUseInteractivePrompt(io: PolicyPromptIo): boolean {
  if (io.readStdinLine) {
    return true;
  }
  return process.stdin.isTTY === true && process.stdout.isTTY === true;
}

async function readOneLine(io: PolicyPromptIo): Promise<string | null> {
  if (io.readStdinLine) {
    return io.readStdinLine();
  }
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    const line = await rl.question("");
    return line;
  } finally {
    rl.close();
  }
}

/**
 * Prompt for Deny / Allow once / Allow for session. Returns deny if user cancels or input unrecognized.
 */
export async function promptSensitiveRunApproval(
  io: PolicyPromptIo,
  operationId: string,
  commandLabel: string,
  env: NodeJS.ProcessEnv
): Promise<InteractiveApprovalChoice | null> {
  if (!isInteractiveApprovalEnabled(env) || !canUseInteractivePrompt(io)) {
    return null;
  }

  const session = env.WORKSPACE_KIT_SESSION_ID?.trim() || "default";
  io.writeError(
    `workspace-kit: sensitive command '${commandLabel}' requires approval (${operationId}).\n` +
      `  [d] Deny   [o] Allow once   [s] Allow for this session (WORKSPACE_KIT_SESSION_ID=${session})\n` +
      `Choice (d/o/s): `
  );

  const raw = await readOneLine(io);
  if (raw === null) {
    return { kind: "deny" };
  }
  const c = raw.trim().toLowerCase();
  if (c === "d" || c === "deny" || c === "n" || c === "no") {
    return { kind: "deny" };
  }
  if (c === "o" || c === "once" || c === "1" || c === "y" || c === "yes" || c === "a") {
    return { kind: "approve", scope: "once" };
  }
  if (c === "s" || c === "session" || c === "2") {
    return { kind: "approve", scope: "session" };
  }
  io.writeError(`Unrecognized choice '${raw.trim()}'; treating as deny.\n`);
  return { kind: "deny" };
}

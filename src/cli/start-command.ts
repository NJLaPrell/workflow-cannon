import path from "node:path";
import fs from "node:fs/promises";
import { defaultWorkspaceKitPaths } from "./default-workspace-kit-paths.js";
import { collectDoctorContractIssues } from "./doctor-contract-validation.js";

/**
 * Friendly status command after attach (`workspace-kit start`).
 */
export async function runWorkspaceKitStartCommand(
  cwd: string,
  argv: string[],
  io: {
    writeLine: (s: string) => void;
    writeError: (s: string) => void;
    readStdinLine?: () => Promise<string | null>;
  },
  exitCodes: {
    success: number;
    validationFailure: number;
    usageError: number;
    internalError: number;
  }
): Promise<number> {
  const wantJson = argv.includes("--json");
  const manifestPath = path.join(cwd, defaultWorkspaceKitPaths.manifest);
  let attached = false;
  try {
    await fs.access(manifestPath);
    attached = true;
  } catch {
    attached = false;
  }

  if (!attached) {
    const msg =
      "This repository is not attached to Workflow Cannon yet. Run `workspace-kit init` (see `workspace-kit --help`).";
    if (wantJson) {
      io.writeLine(
        JSON.stringify(
          {
            ok: false,
            code: "workspace-start-not-attached",
            schemaVersion: 1,
            message: msg
          },
          null,
          2
        )
      );
    } else {
      io.writeLine(msg);
    }
    return exitCodes.validationFailure;
  }

  const issues = await collectDoctorContractIssues(cwd);
  const doctorOk = issues.length === 0;

  if (wantJson) {
    io.writeLine(
      JSON.stringify(
        {
          ok: doctorOk,
          code: "workspace-start",
          schemaVersion: 1,
          data: {
            doctorOk,
            doctorIssues: issues,
            commands: [
              "workspace-kit run agent-bootstrap '{}'",
              "workspace-kit run get-next-actions '{}'",
              "workspace-kit run dashboard-summary '{}'"
            ]
          }
        },
        null,
        2
      )
    );
    return doctorOk ? exitCodes.success : exitCodes.validationFailure;
  }

  if (!doctorOk) {
    io.writeError("workspace-kit start: doctor validation failed.");
    for (const issue of issues) {
      io.writeError(`- ${issue.path}: ${issue.reason}`);
    }
    return exitCodes.validationFailure;
  }

  io.writeLine("workspace-kit start — workspace looks healthy.");
  io.writeLine("- Doctor checks passed.");
  io.writeLine("Useful commands:");
  io.writeLine("  workspace-kit run agent-bootstrap '{}'");
  io.writeLine("  workspace-kit run get-next-actions '{}'");
  io.writeLine("  workspace-kit run dashboard-summary '{}'");
  return exitCodes.success;
}

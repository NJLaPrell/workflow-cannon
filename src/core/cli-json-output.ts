export type WorkspaceKitJsonParseSuccess<T = unknown> = {
  ok: true;
  payload: T;
};

export type WorkspaceKitJsonParseFailure = {
  ok: false;
  code: "workspace-kit-json-stdout-parse-failed";
  message: string;
  remediation: {
    summary: string;
    cleanInvocations: string[];
  };
  details: {
    exitCode?: number;
    stdoutPreview: string;
    stderrPreview?: string;
    suspectedPackageManagerBanner: boolean;
  };
};

export type WorkspaceKitJsonParseOptions = {
  exitCode?: number;
  stderr?: string;
  previewLength?: number;
};

function preview(value: string | undefined, max: number): string | undefined {
  const text = (value ?? "").trim();
  if (!text) return undefined;
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

export function looksLikePackageManagerBanner(stdout: string): boolean {
  const text = stdout.trimStart();
  if (!text.startsWith(">")) return false;
  const firstJson = text.search(/[{\[]/);
  const banner = firstJson >= 0 ? text.slice(0, firstJson) : text;
  return /^>\s+.+/m.test(banner) && /^>\s+.+/m.test(banner.split("\n").slice(1).join("\n"));
}

export function parseWorkspaceKitJsonStdout<T = unknown>(
  stdout: string,
  options: WorkspaceKitJsonParseOptions = {}
): WorkspaceKitJsonParseSuccess<T> | WorkspaceKitJsonParseFailure {
  const max = options.previewLength ?? 400;
  const text = stdout.trim();
  try {
    return { ok: true, payload: JSON.parse(text) as T };
  } catch {
    const suspectedPackageManagerBanner = looksLikePackageManagerBanner(stdout);
    const summary = suspectedPackageManagerBanner
      ? "stdout looks contaminated by a package-manager script banner. Use a banner-free workspace-kit invocation before parsing JSON."
      : "workspace-kit JSON stdout must be captured completely and parsed as one JSON value.";
    return {
      ok: false,
      code: "workspace-kit-json-stdout-parse-failed",
      message: `${summary} Do not split stdout into lines or retry mutating commands until task state has been checked.`,
      remediation: {
        summary,
        cleanInvocations: ["pnpm exec wk run <command> '<json>'", "node dist/cli.js run <command> '<json>'"]
      },
      details: {
        exitCode: options.exitCode,
        stdoutPreview: preview(stdout, max) ?? "",
        stderrPreview: preview(options.stderr, max),
        suspectedPackageManagerBanner
      }
    };
  }
}

import type { CommandClient } from "../../runtime/command-client.js";
import type { ConfigKeyRowInput } from "./render-config.js";

export type LoadConfigKeyRowsResult = {
  rows: ConfigKeyRowInput[];
  errors: string[];
  includeAll: boolean;
};

function getAtPath(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".").filter(Boolean);
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object" || Array.isArray(cur)) {
      return undefined;
    }
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

/**
 * Load config key rows from workspace-kit `config list --json` and `config resolve`.
 * Shared by sidebar Config webview and dashboard Config tab host.
 */
export async function loadConfigKeyRows(
  client: CommandClient,
  options: { includeAll?: boolean } = {}
): Promise<LoadConfigKeyRowsResult> {
  const includeAll = Boolean(options.includeAll);
  const listArgv = includeAll ? ["list", "--json", "--all"] : ["list", "--json"];
  const [listR, resR] = await Promise.all([
    client.config(listArgv),
    client.config(["resolve"])
  ]);
  const errors: string[] = [];
  if (listR.code !== 0) {
    errors.push(`config list exited ${listR.code}: ${(listR.stderr || listR.stdout).trim().slice(0, 400)}`);
  }
  if (resR.code !== 0) {
    errors.push(`config resolve exited ${resR.code}: ${(resR.stderr || resR.stdout).trim().slice(0, 400)}`);
  }

  let keys: unknown[] = [];
  try {
    const parsed = JSON.parse(listR.stdout) as { ok?: boolean; data?: { keys?: unknown[] } };
    if (parsed?.ok && Array.isArray(parsed?.data?.keys)) {
      keys = parsed.data.keys;
    } else if (listR.code === 0) {
      errors.push("config list: unexpected JSON shape");
    }
  } catch {
    if (listR.code === 0) {
      errors.push("config list: stdout is not JSON");
    }
  }

  let effective: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(resR.stdout) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      effective = parsed as Record<string, unknown>;
    } else if (resR.code === 0) {
      errors.push("config resolve: root is not a JSON object");
    }
  } catch {
    if (resR.code === 0) {
      errors.push("config resolve: stdout is not JSON");
    }
  }

  const rows: ConfigKeyRowInput[] = keys.map((raw) => {
    const m = raw as Record<string, unknown>;
    const key = String(m.key ?? "");
    const wl = Array.isArray(m.writableLayers)
      ? (m.writableLayers as unknown[]).map((x) => String(x))
      : [];
    return {
      key,
      type: String(m.type ?? ""),
      description: String(m.description ?? ""),
      default: m.default,
      domainScope: String(m.domainScope ?? ""),
      owningModule: String(m.owningModule ?? ""),
      exposure: String(m.exposure ?? "public"),
      sensitive: Boolean(m.sensitive),
      requiresApproval: Boolean(m.requiresApproval),
      requiresRestart: Boolean(m.requiresRestart),
      writableLayers: wl,
      allowedValues: Array.isArray(m.allowedValues) ? m.allowedValues : undefined,
      effectiveValue: key ? getAtPath(effective, key) : undefined
    };
  });

  return { rows, errors, includeAll };
}

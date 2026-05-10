import fs from "node:fs/promises";
import path from "node:path";
import { parseJsonFile } from "./profile-support.js";

export type PackageManagerKind = "pnpm" | "npm" | "yarn";

export type ScriptDetection = {
  value: string;
  placeholder: boolean;
};

/** Best-effort repo signals for init planning (failures are non-fatal). */
export type InitProjectDetection = {
  cwdBasename: string;
  hasGit: boolean;
  hasPackageJson: boolean;
  packageJsonName?: string;
  lockfileKind?: PackageManagerKind;
  inferredPackageManager: PackageManagerKind;
  scripts: {
    test: ScriptDetection;
    lint: ScriptDetection;
    typecheck: ScriptDetection;
  };
  githubDefaultBranch: string;
  editorIntegrations: {
    cursor: boolean;
    vscode: boolean;
  };
  warnings: string[];
};

async function pathExists(abs: string): Promise<boolean> {
  try {
    await fs.access(abs);
    return true;
  } catch {
    return false;
  }
}

function inferPmFromPackageJsonField(pmField: unknown): PackageManagerKind | undefined {
  if (typeof pmField !== "string") {
    return undefined;
  }
  const lower = pmField.toLowerCase();
  if (lower.includes("pnpm")) {
    return "pnpm";
  }
  if (lower.includes("yarn")) {
    return "yarn";
  }
  if (lower.includes("npm")) {
    return "npm";
  }
  return undefined;
}

function cmdPrefix(pm: PackageManagerKind): string {
  return pm === "pnpm" ? "pnpm" : pm === "yarn" ? "yarn" : "npm";
}

/**
 * Collect lightweight project metadata before attaching Workflow Cannon (non-destructive).
 */
export async function detectInitProjectContext(cwd: string): Promise<InitProjectDetection> {
  const resolved = path.resolve(cwd);
  const cwdBasename = path.basename(resolved);
  const warnings: string[] = [];

  const hasGit = await pathExists(path.join(resolved, ".git"));
  const pkgPath = path.join(resolved, "package.json");
  const hasPackageJson = await pathExists(pkgPath);

  let packageJsonName: string | undefined;
  let pkgPmHint: PackageManagerKind | undefined;
  let scriptsFromPkg: Record<string, unknown> | undefined;

  if (hasPackageJson) {
    try {
      const raw = await parseJsonFile(pkgPath);
      if (raw && typeof raw === "object" && !Array.isArray(raw)) {
        const o = raw as Record<string, unknown>;
        if (typeof o.name === "string" && o.name.trim()) {
          packageJsonName = o.name.trim();
        }
        pkgPmHint = inferPmFromPackageJsonField(o.packageManager);
        if (o.scripts && typeof o.scripts === "object" && !Array.isArray(o.scripts)) {
          scriptsFromPkg = o.scripts as Record<string, unknown>;
        }
      }
    } catch {
      warnings.push("package.json exists but could not be parsed as JSON; ignoring scripts.");
    }
  }

  let lockfileKind: PackageManagerKind | undefined;
  if (await pathExists(path.join(resolved, "pnpm-lock.yaml"))) {
    lockfileKind = "pnpm";
  } else if (await pathExists(path.join(resolved, "yarn.lock"))) {
    lockfileKind = "yarn";
  } else if (await pathExists(path.join(resolved, "package-lock.json"))) {
    lockfileKind = "npm";
  }

  const inferredPackageManager: PackageManagerKind = lockfileKind ?? pkgPmHint ?? "pnpm";

  const readScript = (name: string, defaultPlaceholder: string): ScriptDetection => {
    const direct = scriptsFromPkg?.[name];
    if (typeof direct === "string" && direct.trim().length > 0) {
      return { value: direct.trim(), placeholder: false };
    }
    warnings.push(`Missing scripts.${name} in package.json; using placeholder "${defaultPlaceholder}".`);
    return { value: defaultPlaceholder, placeholder: true };
  };

  const pm = cmdPrefix(inferredPackageManager);
  const test = readScript("test", `${pm} test`);
  const lint = readScript("lint", `${pm} run lint`);
  const typecheck = readScript("typecheck", `${pm} run typecheck`);

  let githubDefaultBranch = "main";
  if (hasGit) {
    try {
      const head = await fs.readFile(path.join(resolved, ".git", "HEAD"), "utf8");
      const m = head.match(/ref: refs\/heads\/(.+)/);
      if (m?.[1]?.trim()) {
        githubDefaultBranch = m[1].trim();
      }
    } catch {
      /* ignore — detached HEAD or unreadable */
    }
  }

  const cursor = await pathExists(path.join(resolved, ".cursor"));
  const vscode = await pathExists(path.join(resolved, ".vscode"));

  return {
    cwdBasename,
    hasGit,
    hasPackageJson,
    packageJsonName,
    lockfileKind,
    inferredPackageManager,
    scripts: { test, lint, typecheck },
    githubDefaultBranch,
    editorIntegrations: { cursor, vscode },
    warnings
  };
}

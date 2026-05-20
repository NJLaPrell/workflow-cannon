import fs from "node:fs";
import path from "node:path";
import type { TaskEntity } from "./types.js";

export type SemverBump = "major" | "minor" | "patch";

export type ProposeReleaseVersionResult = {
  currentVersion: string;
  recommended: string;
  rationale: string;
  breakingTaskIds: string[];
  bump: SemverBump;
  phaseKey: string | null;
  consideredTaskCount: number;
};

type ParsedSemver = { major: number; minor: number; patch: number };

function parseSemver(raw: string): ParsedSemver | null {
  const m = /^(\d+)\.(\d+)\.(\d+)(?:-.+)?$/.exec(raw.trim());
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

function formatSemver(v: ParsedSemver): string {
  return `${v.major}.${v.minor}.${v.patch}`;
}

function bumpSemver(v: ParsedSemver, level: SemverBump): string {
  if (level === "major") {
    return formatSemver({ major: v.major + 1, minor: 0, patch: 0 });
  }
  if (level === "minor") {
    return formatSemver({ major: v.major, minor: v.minor + 1, patch: 0 });
  }
  return formatSemver({ major: v.major, minor: v.minor, patch: v.patch + 1 });
}

function readPackageVersion(workspacePath: string): string {
  const pkgPath = path.join(workspacePath, "package.json");
  const raw = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as { version?: string };
  if (typeof raw.version !== "string" || !raw.version.trim()) {
    throw new Error("package.json missing version");
  }
  return raw.version.trim();
}

function classifyTaskChange(task: TaskEntity): SemverBump {
  const meta = task.metadata;
  const changeKind =
    meta && typeof meta === "object" && !Array.isArray(meta) && typeof meta.changeKind === "string"
      ? meta.changeKind.trim().toLowerCase()
      : "";
  if (changeKind === "breaking" || changeKind === "major") return "major";
  if (changeKind === "feature" || changeKind === "minor") return "minor";
  if (changeKind === "fix" || changeKind === "patch" || changeKind === "chore") return "patch";

  if (task.type === "feature") return "minor";
  if (task.type === "defect" || task.type === "bug") return "patch";
  return "patch";
}

const BUMP_RANK: Record<SemverBump, number> = { patch: 0, minor: 1, major: 2 };

export function proposeReleaseVersion(args: {
  workspacePath: string;
  phaseKey: string | null;
  tasks: TaskEntity[];
}): ProposeReleaseVersionResult {
  const currentVersion = readPackageVersion(args.workspacePath);
  const parsed = parseSemver(currentVersion);
  if (!parsed) {
    throw new Error(`package.json version is not semver-shaped: ${currentVersion}`);
  }

  const phaseKey = args.phaseKey?.trim() || null;
  const completed = args.tasks.filter((t) => {
    if (t.status !== "completed" || t.archived) return false;
    if (!phaseKey) return true;
    return String(t.phaseKey ?? "") === phaseKey;
  });

  let bump: SemverBump = "patch";
  const breakingTaskIds: string[] = [];
  for (const task of completed) {
    const taskBump = classifyTaskChange(task);
    if (taskBump === "major") {
      breakingTaskIds.push(task.id);
    }
    if (BUMP_RANK[taskBump] > BUMP_RANK[bump]) {
      bump = taskBump;
    }
  }

  const recommended = bumpSemver(parsed, bump);
  const rationale =
    breakingTaskIds.length > 0
      ? `Recommend ${bump} bump to ${recommended}: ${breakingTaskIds.length} completed task(s) marked breaking/major (metadata.changeKind or type rules).`
      : completed.length === 0
        ? `Recommend ${bump} bump to ${recommended}: no completed tasks in scope; default patch increment.`
        : `Recommend ${bump} bump to ${recommended} from ${completed.length} completed task(s) in scope (metadata.changeKind when set, else task type heuristics).`;

  return {
    currentVersion,
    recommended,
    rationale,
    breakingTaskIds,
    bump,
    phaseKey,
    consideredTaskCount: completed.length
  };
}

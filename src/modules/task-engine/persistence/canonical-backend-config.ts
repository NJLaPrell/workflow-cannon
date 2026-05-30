import type { ModuleLifecycleContext } from "../../../contracts/module-contract.js";
import type { TasksCanonicalAuthority } from "./task-state-canonical-authority.js";

/** Keep in sync with `GIT_EVENT_LOG_BACKEND_ID` in git-event-log-backend.ts (no import — avoids ESM cycle). */
const GIT_EVENT_LOG_BACKEND_ID = "git-event-log" as const;
/** Keep in sync with `LOCAL_ONLY_BACKEND_ID` in local-only-backend.ts. */
const LOCAL_ONLY_BACKEND_ID = "local-only" as const;
const HOSTED_API_BACKEND_ID = "hosted-api" as const;

/** Config `tasks.canonicalBackend.type` — maps to sync backend implementations. */
export type CanonicalBackendType = "git" | "local-only" | "hosted";

export type CanonicalBackendConfigSource = "canonicalBackend" | "canonicalAuthority" | "default";

export type ResolvedCanonicalBackend = {
  type: CanonicalBackendType;
  /** `CanonicalStateSyncBackend.backendId` for the active implementation. */
  backendId: string;
  /** Effective authority for git hooks, closeout, and legacy readers. */
  canonicalAuthority: TasksCanonicalAuthority;
  /** Which config field selected `type`. */
  configSource: CanonicalBackendConfigSource;
  /** Whether `tasks.canonicalAuthority` was set explicitly in config. */
  authorityExplicit: boolean;
  /** When both `canonicalBackend.type` and `canonicalAuthority` disagree. */
  configConflict: boolean;
  /** `hosted` is design-only until HostedApiBackend ships. */
  hostedImplemented: boolean;
};

const AUTHORITY_FOR_TYPE: Record<CanonicalBackendType, TasksCanonicalAuthority> = {
  git: "git-event-log",
  "local-only": "sqlite",
  hosted: "git-event-log"
};

const TYPE_FOR_AUTHORITY: Record<TasksCanonicalAuthority, CanonicalBackendType> = {
  "git-event-log": "git",
  sqlite: "local-only"
};

const BACKEND_ID_FOR_TYPE: Record<CanonicalBackendType, string> = {
  git: GIT_EVENT_LOG_BACKEND_ID,
  "local-only": LOCAL_ONLY_BACKEND_ID,
  hosted: HOSTED_API_BACKEND_ID
};

export function readCanonicalBackendTypeFromConfig(
  config?: Record<string, unknown> | null
): CanonicalBackendType | null {
  const tasks = config?.tasks as Record<string, unknown> | undefined;
  const raw = tasks?.canonicalBackend;
  if (raw === undefined || raw === null) {
    return null;
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const type = (raw as Record<string, unknown>).type;
  if (type === "git" || type === "local-only" || type === "hosted") {
    return type;
  }
  return null;
}

function readExplicitCanonicalAuthority(config?: Record<string, unknown> | null): {
  value: TasksCanonicalAuthority;
  explicit: boolean;
} {
  const tasks = config?.tasks as Record<string, unknown> | undefined;
  const raw = tasks?.canonicalAuthority ?? tasks?.taskStateCanonicalAuthority;
  if (raw === "git-event-log") {
    return { value: "git-event-log", explicit: true };
  }
  if (raw === "sqlite") {
    return { value: "sqlite", explicit: true };
  }
  return { value: "sqlite", explicit: false };
}

/** Resolve active canonical sync backend from layered config (backend + legacy authority). */
export function resolveCanonicalBackend(config?: Record<string, unknown> | null): ResolvedCanonicalBackend {
  const explicitType = readCanonicalBackendTypeFromConfig(config);
  const authorityRead = readExplicitCanonicalAuthority(config);

  if (explicitType === "hosted") {
    return {
      type: "hosted",
      backendId: BACKEND_ID_FOR_TYPE.hosted,
      canonicalAuthority: AUTHORITY_FOR_TYPE.hosted,
      configSource: "canonicalBackend",
      authorityExplicit: authorityRead.explicit,
      configConflict:
        authorityRead.explicit && TYPE_FOR_AUTHORITY[authorityRead.value] !== "hosted",
      hostedImplemented: false
    };
  }

  if (explicitType) {
    const impliedAuthority = AUTHORITY_FOR_TYPE[explicitType];
    const configConflict =
      authorityRead.explicit && authorityRead.value !== impliedAuthority;
    return {
      type: explicitType,
      backendId: BACKEND_ID_FOR_TYPE[explicitType],
      canonicalAuthority: impliedAuthority,
      configSource: "canonicalBackend",
      authorityExplicit: authorityRead.explicit,
      configConflict,
      hostedImplemented: false
    };
  }

  if (authorityRead.explicit) {
    const type = TYPE_FOR_AUTHORITY[authorityRead.value];
    return {
      type,
      backendId: BACKEND_ID_FOR_TYPE[type],
      canonicalAuthority: authorityRead.value,
      configSource: "canonicalAuthority",
      authorityExplicit: true,
      configConflict: false,
      hostedImplemented: false
    };
  }

  return {
    type: "local-only",
    backendId: BACKEND_ID_FOR_TYPE["local-only"],
    canonicalAuthority: "sqlite",
    configSource: "default",
    authorityExplicit: false,
    configConflict: false,
    hostedImplemented: false
  };
}

/** Legacy authority reader — honors `canonicalBackend` when set, else explicit/default authority. */
export function readTasksCanonicalAuthority(config?: Record<string, unknown> | null): TasksCanonicalAuthority {
  return resolveCanonicalBackend(config).canonicalAuthority;
}

export function isGitTaskStateCanonicalAuthority(ctx: ModuleLifecycleContext): boolean {
  return resolveCanonicalBackend(ctx.effectiveConfig as Record<string, unknown> | undefined).type === "git";
}

export function isLocalOnlyCanonicalBackend(config?: Record<string, unknown> | null): boolean {
  return resolveCanonicalBackend(config).type === "local-only";
}

export function formatResolvedCanonicalBackendLine(resolved: ResolvedCanonicalBackend): string {
  const parts = [
    `Active canonical backend: ${resolved.type}`,
    `backendId=${resolved.backendId}`,
    `canonicalAuthority=${resolved.canonicalAuthority}`,
    `source=${resolved.configSource}`
  ];
  if (resolved.configConflict) {
    parts.push("configConflict=true");
  }
  if (resolved.type === "hosted" && !resolved.hostedImplemented) {
    parts.push("hostedImplemented=false");
  }
  return parts.join(", ");
}


export type LeaseUiStateKind = "free" | "held-by-me" | "held-by-other" | "stale" | "suspect" | "unknown";

export type LeaseActionKind = "claim" | "release" | "recover" | "inspect";

export type LeaseUiState = {
  kind: LeaseUiStateKind;
  statusBarText: string;
  tooltip: string;
  actions: LeaseActionKind[];
};

function stringField(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function objectField(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function leaseHolderLabel(holder: Record<string, unknown> | null): string {
  const taskId = stringField(holder?.taskId);
  const session = stringField(holder?.agentSessionId);
  if (taskId && session) return `${taskId} by ${session}`;
  if (taskId) return taskId;
  if (session) return session;
  return "unknown holder";
}

export function buildLeaseUiState(input: {
  leaseStatus?: Record<string, unknown> | null;
  suspectFlags?: unknown;
}): LeaseUiState {
  const leaseStatus = input.leaseStatus ?? null;
  const state = stringField(leaseStatus?.state ?? leaseStatus?.status);
  const active = leaseStatus?.active === true;
  const staleOrInvalid = leaseStatus?.staleOrInvalid === true;
  const holder = objectField(leaseStatus?.holder);
  const suspectFlags = Array.isArray(input.suspectFlags)
    ? input.suspectFlags.filter((flag): flag is string => typeof flag === "string")
    : [];
  const leaseSuspect = suspectFlags.some((flag) => flag.startsWith("lease:"));

  if (leaseSuspect) {
    return {
      kind: "suspect",
      statusBarText: "$(warning) WC lease suspect",
      tooltip: `Workspace edit lease fingerprint drift detected: ${suspectFlags.join(", ")}`,
      actions: ["inspect", "release", "recover"]
    };
  }

  if (state === "lease-free" || (!active && !staleOrInvalid && holder === null)) {
    return {
      kind: "free",
      statusBarText: "$(unlock) WC lease free",
      tooltip: "No active workspace edit lease.",
      actions: ["claim", "inspect"]
    };
  }

  if (state === "lease-held-by-me") {
    return {
      kind: "held-by-me",
      statusBarText: "$(lock) WC lease mine",
      tooltip: `Workspace edit lease held by this extension session (${leaseHolderLabel(holder)}).`,
      actions: ["release", "inspect"]
    };
  }

  if (state === "lease-held-by-other") {
    return {
      kind: "held-by-other",
      statusBarText: "$(lock) WC lease held",
      tooltip: `Workspace edit lease held by ${leaseHolderLabel(holder)}.`,
      actions: ["inspect"]
    };
  }

  if (state === "stale-invalid" || staleOrInvalid) {
    return {
      kind: "stale",
      statusBarText: "$(warning) WC lease stale",
      tooltip: "Workspace edit lease is stale or invalid and can be recovered.",
      actions: ["recover", "inspect"]
    };
  }

  return {
    kind: "unknown",
    statusBarText: "$(question) WC lease unknown",
    tooltip: "Workspace edit lease status is unavailable.",
    actions: ["inspect"]
  };
}

export function leaseActionLabel(action: LeaseActionKind): string {
  if (action === "claim") return "Claim workspace edit lease";
  if (action === "release") return "Release my workspace edit lease";
  if (action === "recover") return "Recover stale workspace edit lease";
  return "Inspect workspace edit lease";
}
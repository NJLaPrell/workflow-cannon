/** Dashboard slice snapshot model (Option 1 state store). */

export type DashboardSliceName =
  | "overview"
  | "queue"
  | "ideas"
  | "phase"
  | "planArtifact"
  | "planningSession"
  | "phaseJournal"
  | "status"
  | "agent"
  | "team"
  | "subagents"
  | "checkpoints"
  | "cae"
  | "config";

export type DashboardSliceStatus = "empty" | "loading" | "fresh" | "stale" | "error";

export type DashboardSliceValue = Record<string, unknown>;

export type DashboardSlice<T = DashboardSliceValue> = {
  name: DashboardSliceName;
  value: T | null;
  status: DashboardSliceStatus;
  updatedAt: number | null;
  startedAt?: number | null;
  source: string;
  sourceArgs?: Record<string, unknown>;
  planningGeneration?: number | null;
  error?: string | null;
};

export type DashboardSnapshot = {
  schemaVersion: 1;
  generation: number;
  createdAt: number;
  updatedAt: number;
  planningGeneration: number | null;
  slices: Record<DashboardSliceName, DashboardSlice>;
};

export type DashboardSliceUpdate = {
  name: DashboardSliceName;
  previous: DashboardSlice | null;
  next: DashboardSlice;
  changed: boolean;
};

import type {
  DashboardHumanGateRow,
  DashboardHumanGatesSummary
} from "../../../contracts/dashboard-summary-run.js";
import type { DashboardFeatureDetail } from "../../../contracts/dashboard-summary-run.js";
import { humanGateAgeMs, isHumanGateStatus } from "../human-gate.js";
import type { HumanGateRecord } from "../human-gate.js";
import { inferTaskPhaseKey } from "../phase-resolution.js";
import { projectDashboardTaskRow } from "../task-read-projections.js";
import type { TaskEntity } from "../types.js";

function priorityRank(task: TaskEntity): number {
  if (task.priority === "P1") return 0;
  if (task.priority === "P2") return 1;
  if (task.priority === "P3") return 2;
  return 99;
}

function taskRecency(task: TaskEntity): number {
  const n = Date.parse(task.updatedAt || task.createdAt || "");
  return Number.isFinite(n) ? n : 0;
}

function sortHumanGateTasks(a: TaskEntity, b: TaskEntity): number {
  const pr = priorityRank(a) - priorityRank(b);
  if (pr !== 0) return pr;
  const recent = taskRecency(b) - taskRecency(a);
  if (recent !== 0) return recent;
  return a.id.localeCompare(b.id);
}

export function buildDashboardHumanGatesSummary(
  tasks: TaskEntity[],
  currentKitPhase: string | null,
  enrich: Map<string, DashboardFeatureDetail>,
  topLimit = 15
): DashboardHumanGatesSummary {
  const gated = tasks.filter((t) => isHumanGateStatus(t.status));
  const scoped =
    currentKitPhase && currentKitPhase.trim().length > 0
      ? gated.filter((t) => inferTaskPhaseKey(t) === currentKitPhase.trim())
      : gated;
  const sorted = [...scoped].sort(sortHumanGateTasks);
  const top: DashboardHumanGateRow[] = sorted.slice(0, topLimit).map((task) => {
    const gate = task.metadata?.humanGate as HumanGateRecord | undefined;
    const base = projectDashboardTaskRow(task, enrich);
    return {
      ...base,
      status: task.status,
      gateKind: task.status,
      ageMs: gate ? humanGateAgeMs(gate) : 0,
      enteredAt: gate?.enteredAt ?? null,
      requestedDecision: gate?.requestedDecision ?? null,
      owner: gate?.owner ?? null,
      reason: gate?.reason ?? null
    };
  });
  return {
    schemaVersion: 1,
    phaseKey: currentKitPhase,
    count: scoped.length,
    top
  };
}

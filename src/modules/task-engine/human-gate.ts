import type { TaskEntity, TaskStatus } from "./types.js";

export const HUMAN_GATE_STATUSES = [
  "awaiting_review",
  "awaiting_policy_approval",
  "awaiting_external_decision"
] as const;

export type HumanGateStatus = (typeof HUMAN_GATE_STATUSES)[number];

export type HumanGateRecord = {
  owner?: string;
  requestedDecision?: string;
  reason?: string;
  enteredAt: string;
  gateKind: HumanGateStatus;
};

export const HUMAN_GATE_ENTER_ACTIONS = new Set([
  "await_review",
  "await_policy_approval",
  "await_external_decision"
]);

export const HUMAN_GATE_RESUME_ACTIONS = new Set(["resume_ready", "resume_work"]);

const ENTER_ACTION_TO_STATUS: Record<string, HumanGateStatus> = {
  await_review: "awaiting_review",
  await_policy_approval: "awaiting_policy_approval",
  await_external_decision: "awaiting_external_decision"
};

export function isHumanGateStatus(status: TaskStatus): status is HumanGateStatus {
  return (HUMAN_GATE_STATUSES as readonly string[]).includes(status);
}

export function humanGateStatusForEnterAction(action: string): HumanGateStatus | undefined {
  return ENTER_ACTION_TO_STATUS[action];
}

export function readHumanGateInput(args: Record<string, unknown>): Omit<HumanGateRecord, "enteredAt" | "gateKind"> {
  const owner = typeof args.humanGateOwner === "string" ? args.humanGateOwner.trim() : undefined;
  const requestedDecision =
    typeof args.requestedDecision === "string" ? args.requestedDecision.trim() : undefined;
  const reason = typeof args.humanGateReason === "string" ? args.humanGateReason.trim() : undefined;
  return {
    ...(owner ? { owner } : {}),
    ...(requestedDecision ? { requestedDecision } : {}),
    ...(reason ? { reason } : {})
  };
}

export function applyHumanGateMetadata(
  task: TaskEntity,
  targetState: TaskStatus,
  action: string,
  timestamp: string,
  args: Record<string, unknown>
): TaskEntity {
  const base = { ...(task.metadata ?? {}) };
  const enterKind = humanGateStatusForEnterAction(action);
  if (enterKind && isHumanGateStatus(targetState)) {
    const gate: HumanGateRecord = {
      ...readHumanGateInput(args),
      enteredAt: timestamp,
      gateKind: enterKind
    };
    return { ...task, metadata: { ...base, humanGate: gate } };
  }
  if (HUMAN_GATE_RESUME_ACTIONS.has(action) || targetState === "blocked" || targetState === "cancelled") {
    const { humanGate: _removed, ...rest } = base;
    return { ...task, metadata: Object.keys(rest).length > 0 ? rest : undefined };
  }
  return task;
}

export function humanGateAgeMs(gate: HumanGateRecord, nowMs = Date.now()): number {
  const entered = Date.parse(gate.enteredAt);
  return Number.isFinite(entered) ? Math.max(0, nowMs - entered) : 0;
}

export function humanGateResumeCommand(task: TaskEntity): string {
  const gate = task.metadata?.humanGate as HumanGateRecord | undefined;
  const owner = gate?.owner ? ` for ${gate.owner}` : "";
  return `pnpm exec wk run run-transition '{"taskId":"${task.id}","action":"resume_work","policyApproval":{"confirmed":true,"rationale":"human gate cleared${owner}"}}'`;
}

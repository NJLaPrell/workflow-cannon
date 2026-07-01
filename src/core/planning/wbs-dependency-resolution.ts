import type { PlanArtifactWbsItem } from "./plan-artifact-v1.js";
import type { PlanningExecutionTaskDraft } from "./normalize-wbs-to-task-draft.js";
import type { TaskEntity } from "../../modules/task-engine/types.js";

export type WbsDependencyFinding = {
  code: "wbs-dependency-unselected" | "wbs-dependency-invalid";
  severity: "error";
  wbsId?: string;
  dependency: string;
  field: "dependsOn";
  message: string;
};

export type AssignDraftIdentitiesResult = {
  drafts: PlanningExecutionTaskDraft[];
  wbsIdToDraftId: Map<string, string>;
  draftIds: Set<string>;
};

/**
 * Pass 1: assign deterministic task draft ids and index selected WBS rows.
 */
export function assignDeterministicDraftIdentities(
  drafts: PlanningExecutionTaskDraft[],
  selectedWbsRows: PlanArtifactWbsItem[],
  existingTasks: TaskEntity[],
  allocateTaskId: (tasks: TaskEntity[]) => string
): AssignDraftIdentitiesResult {
  let allocBase = [...existingTasks];
  const wbsIdToDraftId = new Map<string, string>();
  const draftIds = new Set<string>();
  const withIds = drafts.map((draft, index) => {
    const id = draft.id ?? allocateTaskId(allocBase);
    const wbsId = selectedWbsRows[index]?.wbsId;
    if (wbsId) {
      wbsIdToDraftId.set(wbsId, id);
    }
    draftIds.add(id);
    const row = { ...draft, id };
    allocBase = [
      ...allocBase,
      {
        id,
        title: draft.title,
        type: draft.type ?? "workspace-kit",
        status: draft.status ?? "proposed",
        createdAt: "",
        updatedAt: "",
        phase: draft.phase,
        phaseKey: draft.phaseKey,
        approach: draft.approach,
        technicalScope: draft.technicalScope,
        acceptanceCriteria: draft.acceptanceCriteria
      }
    ];
    return row;
  });
  return { drafts: withIds, wbsIdToDraftId, draftIds };
}

export type ResolveWbsDependsOnInput = {
  drafts: PlanningExecutionTaskDraft[];
  selectedWbsRows: PlanArtifactWbsItem[];
  wbsIdToDraftId: Map<string, string>;
  draftIds: Set<string>;
  allWbsIds: Set<string>;
  existingTaskIds: Set<string>;
};

/**
 * Pass 2: map normalized WBS dependency tokens to task draft ids (or existing task ids).
 */
export function resolveWbsDependsOnToDraftIds(
  input: ResolveWbsDependsOnInput
): { ok: true; drafts: PlanningExecutionTaskDraft[] } | { ok: false; findings: WbsDependencyFinding[] } {
  const findings: WbsDependencyFinding[] = [];
  const resolved = input.drafts.map((draft, index) => {
    const wbsRow = input.selectedWbsRows[index];
    const resolvedDependsOn: string[] = [];
    for (const dep of draft.dependsOn ?? []) {
      const dependency = dep.trim();
      if (!dependency) {
        continue;
      }
      const selectedDraftId = input.wbsIdToDraftId.get(dependency);
      if (selectedDraftId) {
        resolvedDependsOn.push(selectedDraftId);
        continue;
      }
      if (input.draftIds.has(dependency)) {
        resolvedDependsOn.push(dependency);
        continue;
      }
      if (input.allWbsIds.has(dependency)) {
        findings.push({
          code: "wbs-dependency-unselected",
          severity: "error",
          wbsId: wbsRow?.wbsId,
          dependency,
          field: "dependsOn",
          message: `Selected WBS row '${wbsRow?.wbsId ?? "unknown"}' depends on unselected WBS row '${dependency}'`
        });
        continue;
      }
      if (input.existingTaskIds.has(dependency)) {
        resolvedDependsOn.push(dependency);
        continue;
      }
      findings.push({
        code: "wbs-dependency-invalid",
        severity: "error",
        wbsId: wbsRow?.wbsId,
        dependency,
        field: "dependsOn",
        message: `Selected WBS row '${wbsRow?.wbsId ?? "unknown"}' has invalid dependency '${dependency}' (expected selected WBS row or existing task id)`
      });
    }
    return {
      ...draft,
      dependsOn: resolvedDependsOn.length > 0 ? resolvedDependsOn : undefined
    };
  });

  if (findings.length > 0) {
    return { ok: false, findings };
  }
  return { ok: true, drafts: resolved };
}

export type PrepareFinalizeDraftsInput = {
  drafts: PlanningExecutionTaskDraft[];
  selectedWbsRows: PlanArtifactWbsItem[];
  allWbsRows: PlanArtifactWbsItem[];
  existingTasks: TaskEntity[];
  allocateTaskId: (tasks: TaskEntity[]) => string;
};

/**
 * Two-pass finalize prep: deterministic draft ids, then WBS dependsOn → task draft ids.
 */
export function prepareFinalizeDraftsWithWbsDependencies(
  input: PrepareFinalizeDraftsInput
):
  | { ok: true; drafts: PlanningExecutionTaskDraft[] }
  | { ok: false; message: string; findings: WbsDependencyFinding[] } {
  const pass1 = assignDeterministicDraftIdentities(
    input.drafts,
    input.selectedWbsRows,
    input.existingTasks,
    input.allocateTaskId
  );
  const pass2 = resolveWbsDependsOnToDraftIds({
    drafts: pass1.drafts,
    selectedWbsRows: input.selectedWbsRows,
    wbsIdToDraftId: pass1.wbsIdToDraftId,
    draftIds: pass1.draftIds,
    allWbsIds: new Set(input.allWbsRows.map((row) => row.wbsId)),
    existingTaskIds: new Set(input.existingTasks.map((task) => task.id))
  });
  if (!pass2.ok) {
    return {
      ok: false,
      message: "Finalize blocked: dependency resolution failed",
      findings: pass2.findings
    };
  }
  return { ok: true, drafts: pass2.drafts };
}

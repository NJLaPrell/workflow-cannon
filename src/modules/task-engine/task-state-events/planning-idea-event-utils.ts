import type { PlanningIdeaSnapshotV1 } from "./planning-event-payloads.js";
import type { WorkflowIdeaProjectionRow } from "./planning-projection-types.js";

export function ideaRecordToEventSnapshot(idea: {
  id: string;
  title: string;
  note?: string;
  status: WorkflowIdeaProjectionRow["status"];
  sortOrder: number;
  linkedPlanArtifact?: string;
  previousPlanArtifacts: string[];
  createdAt: string;
  updatedAt: string;
}): PlanningIdeaSnapshotV1 {
  return {
    id: idea.id,
    title: idea.title,
    note: idea.note ?? null,
    status: idea.status,
    sortOrder: idea.sortOrder,
    linkedPlanArtifact: idea.linkedPlanArtifact ?? null,
    previousPlanArtifacts: [...idea.previousPlanArtifacts],
    createdAt: idea.createdAt,
    updatedAt: idea.updatedAt
  };
}

export function eventSnapshotToWorkflowIdeaRow(snapshot: PlanningIdeaSnapshotV1): WorkflowIdeaProjectionRow {
  return {
    id: snapshot.id,
    title: snapshot.title,
    note: snapshot.note,
    status: snapshot.status,
    sortOrder: snapshot.sortOrder,
    linkedPlanArtifact: snapshot.linkedPlanArtifact,
    previousPlanArtifacts: [...snapshot.previousPlanArtifacts],
    createdAt: snapshot.createdAt,
    updatedAt: snapshot.updatedAt
  };
}

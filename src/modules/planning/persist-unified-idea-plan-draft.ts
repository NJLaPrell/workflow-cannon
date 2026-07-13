import type Database from "better-sqlite3";
import type { PlanArtifactV1 } from "../../core/planning/plan-artifact-v1.js";
import { getPlanArtifactStoragePaths } from "../../core/planning/plan-artifact-storage.js";
import { writeNextIdeaPlanArtifactVersion } from "./idea-plan/idea-plan-artifact-storage.js";
import {
  mergePlanArtifactIntoIdeaPlanDocument,
  pinArtifactToUnifiedIdeaPlan,
  resolveUnifiedIdeaPlanDraftTarget
} from "./idea-plan/idea-plan-planning-init.js";
import { linkActiveDraftPlanArtifactFromPersistedDraft } from "../ideas/idea-planning-metadata.js";
import { promotePlanningSessionToDraftReadyAfterDraftPersist } from "../ideas/planning-session-draft-ready.js";
import { toPlanningChatSessionResponse } from "../ideas/planning-chat-session.js";
import type { CommitPlanArtifactDraftPersistResult } from "./persist-plan-artifact-draft.js";
import { writePlanArtifactDraftIdempotencyRecord } from "./persist-plan-artifact-draft.js";

export function isUnifiedIdeaPlanDraftTarget(
  workspacePath: string,
  db: Database.Database,
  artifact: PlanArtifactV1
): boolean {
  return resolveUnifiedIdeaPlanDraftTarget(workspacePath, db, artifact) !== null;
}

export function commitUnifiedIdeaPlanDraftPersist(args: {
  workspacePath: string;
  artifact: PlanArtifactV1;
  clientMutationId?: string;
  digest: string;
  sqliteDb: Database.Database;
}): CommitPlanArtifactDraftPersistResult {
  const { workspacePath, artifact, clientMutationId, digest, sqliteDb } = args;
  const target = resolveUnifiedIdeaPlanDraftTarget(workspacePath, sqliteDb, artifact);
  if (!target) {
    throw new Error("commitUnifiedIdeaPlanDraftPersist requires a unified IdeaPlan draft target");
  }

  const nowIso = new Date().toISOString();
  const pinned = pinArtifactToUnifiedIdeaPlan(artifact, target.document);
  const merged = mergePlanArtifactIntoIdeaPlanDocument(target.document, pinned, workspacePath, nowIso);
  const persisted = writeNextIdeaPlanArtifactVersion(workspacePath, merged, { sqliteDb });
  const responseArtifact: PlanArtifactV1 = {
    ...pinned,
    planId: persisted.planId,
    version: persisted.version,
    planRef: persisted.planRef,
    status: "draft",
    provenance: {
      ...pinned.provenance,
      updatedAt: nowIso
    }
  };

  const paths = getPlanArtifactStoragePaths(workspacePath, persisted.planId);
  const storagePath = paths.artifactFileRelative(persisted.version);

  linkActiveDraftPlanArtifactFromPersistedDraft(sqliteDb, responseArtifact, nowIso);
  const promoted = promotePlanningSessionToDraftReadyAfterDraftPersist(sqliteDb, responseArtifact, nowIso);
  const planningChatSession = promoted ? toPlanningChatSessionResponse(promoted) : undefined;

  if (clientMutationId) {
    writePlanArtifactDraftIdempotencyRecord(
      workspacePath,
      clientMutationId,
      {
        schemaVersion: 1,
        payloadDigest: digest,
        planId: persisted.planId,
        version: persisted.version,
        planRef: persisted.planRef,
        storagePath
      },
      undefined,
      sqliteDb
    );
  }

  return {
    artifact: responseArtifact,
    paths,
    storagePath,
    ...(planningChatSession ? { planningChatSession } : {})
  };
}

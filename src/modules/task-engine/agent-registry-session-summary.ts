import type Database from "better-sqlite3";
import type {
  DashboardAgentRegistrySessionSummary,
  DashboardAgentRegistrySessionTopOpenSessionRow
} from "../../contracts/dashboard-summary-run.js";
import type { AgentSessionSnapshotAgentRegistrySessionContext } from "../../contracts/agent-session-snapshot-run.js";
import {
  assertAgentDefinitionBridgeSchema,
  listAgentDefinitions
} from "./agent-definition-store.js";
import {
  assertAgentSessionsKitSchema,
  listSessions
} from "../agent-sessions/agent-session-store.js";
import { listAssignments } from "../team-execution/assignment-store.js";

const ACTIVE_ASSIGNMENT_STATUSES = new Set(["assigned", "submitted", "blocked"]);
const KNOWN_HOST_HINTS = ["cursor", "vscode", "cli", "manual"] as const;

type HostHintKey = (typeof KNOWN_HOST_HINTS)[number] | "unknown";

function emptySummary(): DashboardAgentRegistrySessionSummary {
  return {
    schemaVersion: 1,
    available: false,
    definitionsCount: 0,
    orchestrationReadyDefinitionsCount: 0,
    retiredDefinitionsCount: 0,
    openSessionsCount: 0,
    activeAssignmentsCount: 0,
    linkedOpenSessionsCount: 0,
    hostAvailability: {
      cursor: 0,
      vscode: 0,
      cli: 0,
      manual: 0,
      unknown: 0
    },
    capabilityAvailability: {
      required: [],
      optional: []
    },
    currentPointers: {
      assignment: 0,
      task: 0,
      activity: 0
    },
    topOpenSessions: []
  };
}

function normalizeHostHint(raw: string | null): HostHintKey {
  if (!raw) {
    return "unknown";
  }
  const normalized = raw.trim().toLowerCase();
  return (KNOWN_HOST_HINTS as readonly string[]).includes(normalized)
    ? (normalized as HostHintKey)
    : "unknown";
}

function toTopOpenSessionRows(db: Database.Database): DashboardAgentRegistrySessionTopOpenSessionRow[] {
  const sessions = listSessions(db, { status: "open" });
  return sessions.slice(0, 15).map((session) => ({
    sessionId: session.id,
    agentId: session.agentId,
    hostHint: session.hostHint,
    modelTier: session.modelTier,
    currentAssignmentId: session.currentAssignmentId,
    currentTaskId: session.currentTaskId,
    currentActivityId: session.currentActivityId,
    status: session.status,
    updatedAt: session.updatedAt
  }));
}

export function summarizeAgentRegistrySessions(
  db: Database.Database | undefined,
  dbPathAbs: string
): DashboardAgentRegistrySessionSummary {
  const empty = emptySummary();
  if (!db) {
    return empty;
  }

  const definitionSchema = assertAgentDefinitionBridgeSchema(dbPathAbs);
  const sessionSchema = assertAgentSessionsKitSchema(dbPathAbs);
  if (!definitionSchema.ok || !sessionSchema.ok) {
    return empty;
  }

  try {
    const definitions = listAgentDefinitions(db, { includeRetired: true, orchestrationOnly: false });
    const sessions = listSessions(db, {});
    const assignments = listAssignments(db, {});

    const hostAvailability: DashboardAgentRegistrySessionSummary["hostAvailability"] = {
      cursor: 0,
      vscode: 0,
      cli: 0,
      manual: 0,
      unknown: 0
    };

    const requiredCapabilities = new Set<string>();
    const optionalCapabilities = new Set<string>();

    for (const definition of definitions) {
      if (!definition.agentDefinition) {
        continue;
      }
      for (const host of definition.agentDefinition.hostCompatibility) {
        const key = normalizeHostHint(host);
        hostAvailability[key] += 1;
      }
      for (const capability of definition.agentDefinition.requiredCapabilities) {
        const trimmed = capability.trim();
        if (trimmed) {
          requiredCapabilities.add(trimmed);
        }
      }
      for (const capability of definition.agentDefinition.optionalCapabilities) {
        const trimmed = capability.trim();
        if (trimmed) {
          optionalCapabilities.add(trimmed);
        }
      }
    }

    const openSessions = sessions.filter((session) => session.status === "open");
    const currentPointers = {
      assignment: openSessions.filter((session) => Boolean(session.currentAssignmentId)).length,
      task: openSessions.filter((session) => Boolean(session.currentTaskId)).length,
      activity: openSessions.filter((session) => Boolean(session.currentActivityId)).length
    };

    for (const session of openSessions) {
      const key = normalizeHostHint(session.hostHint);
      hostAvailability[key] += 1;
    }

    const activeAssignmentIds = new Set(
      assignments
        .filter((assignment) => ACTIVE_ASSIGNMENT_STATUSES.has(assignment.status))
        .map((assignment) => assignment.id)
    );

    const linkedOpenSessionsCount = openSessions.filter((session) => {
      return session.currentAssignmentId ? activeAssignmentIds.has(session.currentAssignmentId) : false;
    }).length;

    return {
      schemaVersion: 1,
      available: true,
      definitionsCount: definitions.length,
      orchestrationReadyDefinitionsCount: definitions.filter((definition) => definition.orchestrationReady).length,
      retiredDefinitionsCount: definitions.filter((definition) => definition.retired).length,
      openSessionsCount: openSessions.length,
      activeAssignmentsCount: activeAssignmentIds.size,
      linkedOpenSessionsCount,
      hostAvailability,
      capabilityAvailability: {
        required: [...requiredCapabilities].sort((a, b) => a.localeCompare(b)),
        optional: [...optionalCapabilities].sort((a, b) => a.localeCompare(b))
      },
      currentPointers,
      topOpenSessions: toTopOpenSessionRows(db)
    };
  } catch {
    return empty;
  }
}

export function summarizeAgentRegistrySessionsForAgentSnapshot(
  db: Database.Database | undefined,
  dbPathAbs: string
): AgentSessionSnapshotAgentRegistrySessionContext {
  return summarizeAgentRegistrySessions(db, dbPathAbs);
}

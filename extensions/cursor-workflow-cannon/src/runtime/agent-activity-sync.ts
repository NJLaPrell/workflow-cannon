import * as vscode from "vscode";
import fs from "node:fs";
import type { DashboardAgentStatusKind } from "@workflow-cannon/workspace-kit/contracts/dashboard-summary-run";
import type { CommandClient, CommandClientActivityEnvelope } from "./command-client.js";
import {
  buildCursorProjectsAgentTranscriptsPath,
  readCursorTranscriptOrchestratorContext,
  type CursorTranscriptActiveSubagent
} from "./cursor-transcript-agent-activity-bridge.js";
import { thinkingLevelFromModelSlug } from "./agent-activity-profile.js";
import { logWc } from "./workflow-cannon-log.js";

export type AgentActivitySyncSettings = {
  enabled: boolean;
  syncFromTranscripts: boolean;
  agentId: string;
  agentDefinitionId: string;
  modelHint: string | null;
  thinkingLevel: string | null;
  modelTier: string | null;
  hostHint: string;
  idlePulseSeconds: number;
  activeSubagentWindowSeconds: number;
};

const DEFAULT_SETTINGS: AgentActivitySyncSettings = {
  enabled: true,
  syncFromTranscripts: true,
  agentId: "cursor-orchestrator",
  agentDefinitionId: "orchestrator",
  modelHint: null,
  thinkingLevel: null,
  modelTier: null,
  hostHint: "cursor",
  idlePulseSeconds: 60,
  activeSubagentWindowSeconds: 120
};

export function readAgentActivitySyncSettings(): AgentActivitySyncSettings {
  const cfg = vscode.workspace.getConfiguration("workflowCannon.agentActivity");
  const enabled = cfg.get<boolean>("enabled") !== false;
  const syncFromTranscripts = cfg.get<boolean>("syncFromTranscripts") !== false;
  const agentId = cfg.get<string>("agentId")?.trim() || DEFAULT_SETTINGS.agentId;
  const agentDefinitionId = cfg.get<string>("agentDefinitionId")?.trim() || DEFAULT_SETTINGS.agentDefinitionId;
  const modelHint = cfg.get<string>("modelHint")?.trim() || null;
  const thinkingLevel = cfg.get<string>("thinkingLevel")?.trim() || null;
  const modelTier = cfg.get<string>("modelTier")?.trim() || null;
  const hostHint = cfg.get<string>("hostHint")?.trim() || DEFAULT_SETTINGS.hostHint;
  const idlePulseSeconds = Math.max(30, cfg.get<number>("idlePulseSeconds") ?? DEFAULT_SETTINGS.idlePulseSeconds);
  const activeSubagentWindowSeconds = Math.max(
    30,
    cfg.get<number>("activeSubagentWindowSeconds") ?? DEFAULT_SETTINGS.activeSubagentWindowSeconds
  );
  return {
    enabled,
    syncFromTranscripts,
    agentId,
    agentDefinitionId,
    modelHint,
    thinkingLevel,
    modelTier,
    hostHint,
    idlePulseSeconds,
    activeSubagentWindowSeconds
  };
}

export class AgentActivitySyncCoordinator {
  private readonly workspaceRoot: string;
  private readonly client: CommandClient;
  private transcriptWatcher: fs.FSWatcher | undefined;
  private idleTimer: ReturnType<typeof setInterval> | undefined;
  private debounceTimer: ReturnType<typeof setTimeout> | undefined;
  private lastDashboardActivityAt = 0;
  private lastParentSessionId: string | null = null;
  private started = false;

  constructor(
    workspaceRoot: string,
    client: CommandClient,
    private readonly onSynced?: () => void
  ) {
    this.workspaceRoot = workspaceRoot;
    this.client = client;
  }

  resolveEnvelope(): CommandClientActivityEnvelope {
    const settings = readAgentActivitySyncSettings();
    const context = readCursorTranscriptOrchestratorContext(this.workspaceRoot, {
      activeWithinMs: settings.activeSubagentWindowSeconds * 1000
    });
    const sessionId = context?.parentSessionId ?? this.lastParentSessionId ?? "cursor-main";
    if (context?.parentSessionId) {
      this.lastParentSessionId = context.parentSessionId;
    }
    const thinking =
      settings.thinkingLevel ??
      thinkingLevelFromModelSlug(settings.modelHint) ??
      null;
    return {
      agentId: settings.agentId,
      sessionId,
      activityId: `cursor:${sessionId}`,
      agentDefinitionId: settings.agentDefinitionId,
      hostHint: settings.hostHint,
      modelTier: settings.modelTier ?? undefined,
      modelHint: settings.modelHint ?? undefined,
      thinkingLevel: thinking ?? undefined
    };
  }

  noteDashboardActivity(): void {
    this.lastDashboardActivityAt = Date.now();
  }

  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    const settings = readAgentActivitySyncSettings();
    if (!settings.enabled) {
      return;
    }
    if (settings.syncFromTranscripts) {
      this.startTranscriptWatcher();
    }
    void this.syncNow("startup");
    const intervalMs = settings.idlePulseSeconds * 1000;
    this.idleTimer = setInterval(() => {
      void this.syncNow("idle-pulse");
    }, intervalMs);
  }

  stop(): void {
    this.started = false;
    this.transcriptWatcher?.close();
    this.transcriptWatcher = undefined;
    if (this.idleTimer) {
      clearInterval(this.idleTimer);
      this.idleTimer = undefined;
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = undefined;
    }
  }

  async syncNow(reason: string): Promise<void> {
    const settings = readAgentActivitySyncSettings();
    if (!settings.enabled) {
      return;
    }
    try {
      if (settings.syncFromTranscripts) {
        await this.syncFromTranscripts(settings, reason);
      } else {
        await this.recordOrchestratorActivity(settings, "awaiting_instruction", null, reason);
      }
    } catch (error) {
      logWc(
        "agent-activity-sync",
        `sync failed (${reason}): ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      this.onSynced?.();
    }
  }

  private startTranscriptWatcher(): void {
    const root = buildCursorProjectsAgentTranscriptsPath(this.workspaceRoot);
    try {
      if (!fs.existsSync(root)) {
        fs.mkdirSync(root, { recursive: true });
      }
      this.transcriptWatcher = fs.watch(root, { recursive: true }, () => {
        if (this.debounceTimer) {
          clearTimeout(this.debounceTimer);
        }
        this.debounceTimer = setTimeout(() => {
          void this.syncNow("transcript-watch");
        }, 1500);
      });
    } catch (error) {
      logWc(
        "agent-activity-sync",
        `transcript watch unavailable: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private async syncFromTranscripts(settings: AgentActivitySyncSettings, reason: string): Promise<void> {
    const context = readCursorTranscriptOrchestratorContext(this.workspaceRoot, {
      activeWithinMs: settings.activeSubagentWindowSeconds * 1000
    });
    if (!context) {
      await this.recordOrchestratorActivity(settings, "awaiting_instruction", null, reason);
      return;
    }
    this.lastParentSessionId = context.parentSessionId;

    const dashboardRecent = Date.now() - this.lastDashboardActivityAt < 30_000;
    const orchestratorKind: DashboardAgentStatusKind =
      context.activeSubagents.length > 0
        ? "delegating_task"
        : Date.now() - context.parentUpdatedAtMs < settings.activeSubagentWindowSeconds * 1000
          ? "working_task"
          : "awaiting_instruction";

    if (!dashboardRecent) {
      await this.recordOrchestratorActivity(
        settings,
        orchestratorKind,
        context.activeSubagents.length > 0
          ? `Delegating ${String(context.activeSubagents.length)} subagent${context.activeSubagents.length === 1 ? "" : "s"}`
          : null,
        reason,
        context.parentSessionId
      );
    }

    for (const subagent of context.activeSubagents) {
      await this.recordSubagentActivity(settings, subagent, context.parentSessionId, reason);
    }
  }

  private async recordOrchestratorActivity(
    settings: AgentActivitySyncSettings,
    kind: DashboardAgentStatusKind,
    label: string | null,
    reason: string,
    sessionId = this.lastParentSessionId ?? "cursor-main"
  ): Promise<void> {
    const thinking =
      settings.thinkingLevel ??
      thinkingLevelFromModelSlug(settings.modelHint) ??
      undefined;
    await this.client.recordActivity(
      {
        kind,
        label: label ?? undefined,
        agentId: settings.agentId,
        sessionId,
        activityId: `cursor:${sessionId}`,
        agentDefinitionId: settings.agentDefinitionId,
        hostHint: settings.hostHint,
        modelTier: settings.modelTier ?? undefined,
        modelHint: settings.modelHint ?? undefined,
        thinkingLevel: thinking,
        details: {
          source: "cursor-transcript-bridge",
          bridgeReason: reason,
          agentDisplayName: settings.agentId
        }
      },
      { dashboardBoundary: false }
    );
  }

  private async recordSubagentActivity(
    settings: AgentActivitySyncSettings,
    subagent: CursorTranscriptActiveSubagent,
    parentSessionId: string,
    reason: string
  ): Promise<void> {
    const sessionId = subagent.sessionId ?? "unknown";
    const agentId = subagent.taskId ? `worker-${subagent.taskId}` : `cursor-subagent:${sessionId}`;
    const label =
      subagent.agentDisplayName ??
      (subagent.taskId ? `Working ${subagent.taskId}` : `Subagent ${sessionId.slice(0, 8)}`);
    await this.client.recordActivity(
      {
        kind: "working_task",
        label,
        taskId: subagent.taskId ?? undefined,
        agentId,
        sessionId,
        activityId: `cursor-subagent:${sessionId}`,
        agentDefinitionId: subagent.agentDefinitionId,
        hostHint: settings.hostHint,
        modelHint: subagent.model ?? undefined,
        thinkingLevel: subagent.thinkingLevel ?? thinkingLevelFromModelSlug(subagent.model) ?? undefined,
        details: {
          source: "cursor-transcript-bridge",
          bridgeReason: reason,
          agentDisplayName: subagent.agentDisplayName ?? subagent.description,
          customAgentName: subagent.description,
          parentSessionId,
          subagentType: subagent.subagentType,
          transcriptPath: subagent.transcriptRelativePath
        }
      },
      { dashboardBoundary: false }
    );
  }
}

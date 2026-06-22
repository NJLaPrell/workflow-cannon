import { redactAuditMetadata, summarizeAuditRedaction } from "./audit-redaction.js";

export const MCP_DEBUG_ENV_VAR = "WORKFLOW_CANNON_MCP_DEBUG";
export const MCP_DEBUG_MAX_LINE_LENGTH = 512;
export const MCP_DEBUG_MAX_LINES_PER_SESSION = 200;

export interface McpDebugLoggingConfig {
  enabled: boolean;
  envVar: typeof MCP_DEBUG_ENV_VAR;
  maxLineLength: number;
  maxLinesPerSession: number;
}

export interface McpDebugLogEntry {
  schemaVersion: 1;
  timestamp: string;
  event: string;
  details?: Record<string, unknown>;
  redaction?: {
    applied: boolean;
    kinds: string[];
  };
}

export function resolveMcpDebugLogging(env: NodeJS.ProcessEnv = process.env): McpDebugLoggingConfig {
  const raw = env[MCP_DEBUG_ENV_VAR]?.trim().toLowerCase();
  const enabled = raw === "1" || raw === "true" || raw === "yes";
  return {
    enabled,
    envVar: MCP_DEBUG_ENV_VAR,
    maxLineLength: MCP_DEBUG_MAX_LINE_LENGTH,
    maxLinesPerSession: MCP_DEBUG_MAX_LINES_PER_SESSION
  };
}

export function describeMcpDebugLoggingPolicy(config: McpDebugLoggingConfig): {
  explicit: true;
  bounded: true;
  enabled: boolean;
  envVar: string;
  maxLineLength: number;
  maxLinesPerSession: number;
  note: string;
} {
  return {
    explicit: true,
    bounded: true,
    enabled: config.enabled,
    envVar: config.envVar,
    maxLineLength: config.maxLineLength,
    maxLinesPerSession: config.maxLinesPerSession,
    note: config.enabled
      ? "Debug logging is enabled via env and emits bounded, redacted lines to stderr."
      : "Debug logging is disabled by default. Set WORKFLOW_CANNON_MCP_DEBUG=1 to enable bounded stderr diagnostics."
  };
}

export class McpDebugLogger {
  private lineCount = 0;

  constructor(
    private readonly config: McpDebugLoggingConfig,
    private readonly write: (line: string) => void = (line) => process.stderr.write(`${line}\n`)
  ) {}

  log(event: string, details?: Record<string, unknown>): void {
    if (!this.config.enabled) {
      return;
    }
    if (this.lineCount >= this.config.maxLinesPerSession) {
      if (this.lineCount === this.config.maxLinesPerSession) {
        this.emit({
          schemaVersion: 1,
          timestamp: new Date().toISOString(),
          event: "debug-log-limit-reached",
          details: {
            maxLinesPerSession: this.config.maxLinesPerSession
          }
        });
        this.lineCount += 1;
      }
      return;
    }

    const redaction = details ? summarizeAuditRedaction(details) : undefined;
    const entry: McpDebugLogEntry = {
      schemaVersion: 1,
      timestamp: new Date().toISOString(),
      event,
      ...(details
        ? {
            details: redactAuditMetadata(details) as Record<string, unknown>,
            redaction: {
              applied: redaction?.redacted ?? false,
              kinds: redaction?.kinds ?? []
            }
          }
        : {})
    };
    this.emit(entry);
    this.lineCount += 1;
  }

  get emittedLineCount(): number {
    return this.lineCount;
  }

  private emit(entry: McpDebugLogEntry): void {
    let line = JSON.stringify(entry);
    if (line.length > this.config.maxLineLength) {
      line = `${line.slice(0, this.config.maxLineLength)}...[truncated:${line.length - this.config.maxLineLength}:debug-line-chars]`;
    }
    this.write(line);
  }
}

import type { WorkflowModule } from "../../contracts/module-contract.js";
import { builtinInstructionEntriesForModule } from "../../contracts/builtin-run-command-manifest.js";
import {
  approveMemoryRecord,
  listMemoryRecords,
  pruneMemoryRecord,
  upsertMemoryDraft,
  type MemoryRecordStatus
} from "./memory-store.js";
import { explainMemoryPrecedence } from "./precedence.js";

function parseStatus(raw: unknown): MemoryRecordStatus | undefined {
  if (raw === "draft" || raw === "approved" || raw === "pruned") return raw;
  return undefined;
}

export const projectMemoryModule: WorkflowModule = {
  registration: {
    id: "project-memory",
    version: "0.1.0",
    contractVersion: "1",
    stateSchema: 1,
    capabilities: ["project-memory"],
    dependsOn: [],
    optionalPeers: [],
    enabledByDefault: true,
    config: {
      path: "src/modules/project-memory/config.md",
      format: "md",
      description: "Governed operational memory distinct from .ai/ canon and generated docs."
    },
    instructions: {
      directory: "src/modules/project-memory/instructions",
      entries: builtinInstructionEntriesForModule("project-memory")
    }
  },

  async onCommand(command, ctx) {
    const args = command.args ?? {};
    const ws = ctx.workspacePath;

    if (command.name === "list-memory") {
      const status = parseStatus(args.status);
      const category = typeof args.category === "string" ? args.category.trim() : undefined;
      const records = listMemoryRecords(ws, {
        status,
        category: category || undefined
      });
      return {
        ok: true,
        code: "memory-listed",
        data: { records, count: records.length }
      };
    }

    if (command.name === "write-memory") {
      const category = typeof args.category === "string" ? args.category.trim() : "";
      const body = typeof args.body === "string" ? args.body.trim() : "";
      const id = typeof args.id === "string" ? args.id.trim() : undefined;
      if (!category || !body) {
        return { ok: false, code: "invalid-args", message: "write-memory requires category and body" };
      }
      try {
        const record = upsertMemoryDraft(ws, { id, category, body });
        return { ok: true, code: "memory-written", data: { record } };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, code: "memory-write-failed", message };
      }
    }

    if (command.name === "approve-memory") {
      const id = typeof args.id === "string" ? args.id.trim() : "";
      if (!id) {
        return { ok: false, code: "invalid-args", message: "approve-memory requires id" };
      }
      try {
        const record = approveMemoryRecord(ws, id);
        return { ok: true, code: "memory-approved", data: { record } };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, code: "memory-approve-failed", message };
      }
    }

    if (command.name === "prune-memory") {
      const id = typeof args.id === "string" ? args.id.trim() : "";
      const auditNote = typeof args.auditNote === "string" ? args.auditNote.trim() : "";
      if (!id || !auditNote) {
        return {
          ok: false,
          code: "invalid-args",
          message: "prune-memory requires id and auditNote"
        };
      }
      try {
        const record = pruneMemoryRecord(ws, id, auditNote);
        return { ok: true, code: "memory-pruned", data: { record } };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, code: "memory-prune-failed", message };
      }
    }

    if (command.name === "explain-memory-precedence") {
      const explained = explainMemoryPrecedence(ws);
      return {
        ok: true,
        code: "memory-precedence-explained",
        data: explained
      };
    }

    return { ok: false, code: "unknown-command", message: `Unknown project-memory command: ${command.name}` };
  }
};

export { explainMemoryPrecedence } from "./precedence.js";

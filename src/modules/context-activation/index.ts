import { Buffer } from "node:buffer";

import type { ModuleCommandResult, WorkflowModule } from "../../contracts/module-contract.js";
import { builtinInstructionEntriesForModule } from "../../contracts/builtin-run-command-manifest.js";
import { loadCaeRegistry } from "../../core/cae/cae-registry-load.js";
import type { CaeLoadedRegistry } from "../../core/cae/cae-registry-load.js";

function requireSchemaV1(args: Record<string, unknown>): ModuleCommandResult | null {
  if (args.schemaVersion !== 1) {
    return {
      ok: false,
      code: "invalid-args",
      message: "schemaVersion must be 1"
    };
  }
  return null;
}

function decodeCursor(cursor: unknown): number {
  if (typeof cursor !== "string" || cursor.length === 0) return 0;
  try {
    const o = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as { o?: unknown };
    return typeof o?.o === "number" && o.o >= 0 ? Math.floor(o.o) : 0;
  } catch {
    return 0;
  }
}

function encodeCursor(offset: number): string {
  return Buffer.from(JSON.stringify({ o: offset }), "utf8").toString("base64url");
}

function paginateIds(
  ids: string[],
  limitRaw: unknown,
  cursorRaw: unknown
): { page: string[]; nextCursor: string | null } {
  const limit = Math.min(200, Math.max(1, typeof limitRaw === "number" ? limitRaw : 50));
  const start = decodeCursor(cursorRaw);
  const page = ids.slice(start, start + limit);
  const nextStart = start + page.length;
  const nextCursor = nextStart < ids.length ? encodeCursor(nextStart) : null;
  return { page, nextCursor };
}

function loadOrFail(
  workspacePath: string
):
  | { ok: true; reg: CaeLoadedRegistry }
  | { ok: false; code: string; message: string; remediation?: { instructionPath: string } } {
  const res = loadCaeRegistry(workspacePath);
  if (!res.ok) {
    return {
      ok: false,
      code: res.code,
      message: res.message,
      remediation: { instructionPath: "src/modules/context-activation/instructions/cae-list-artifacts.md" }
    };
  }
  return { ok: true, reg: res.value };
}

export const contextActivationModule: WorkflowModule = {
  registration: {
    id: "context-activation",
    version: "0.1.0",
    contractVersion: "1",
    stateSchema: 1,
    capabilities: ["diagnostics"],
    dependsOn: [],
    optionalPeers: [],
    enabledByDefault: true,
    config: {
      path: "src/modules/context-activation/config.md",
      format: "md",
      description: "Context Activation Engine (CAE) read-only registry and evaluation commands."
    },
    instructions: {
      directory: "src/modules/context-activation/instructions",
      entries: builtinInstructionEntriesForModule("context-activation")
    }
  },

  async onCommand(command, ctx): Promise<ModuleCommandResult> {
    const args = command.args ?? {};
    const name = command.name;
    const ws = ctx.workspacePath;

    if (name === "cae-list-artifacts") {
      const bad = requireSchemaV1(args);
      if (bad) return bad;
      const loaded = loadOrFail(ws);
      if (!loaded.ok) return loaded;
      const { reg } = loaded;
      let ids = [...reg.artifactById.keys()].sort((a, b) => a.localeCompare(b));
      const typeFilter = typeof args.artifactType === "string" ? args.artifactType.trim() : "";
      if (typeFilter) {
        ids = ids.filter((id) => {
          const row = reg.artifactById.get(id);
          return row && (row.artifactType as string) === typeFilter;
        });
      }
      const { page, nextCursor } = paginateIds(ids, args.limit, args.cursor);
      return {
        ok: true,
        code: "cae-list-artifacts-ok",
        data: {
          schemaVersion: 1,
          artifactIds: page,
          nextCursor
        }
      };
    }

    if (name === "cae-get-artifact") {
      const bad = requireSchemaV1(args);
      if (bad) return bad;
      const artifactId = typeof args.artifactId === "string" ? args.artifactId.trim() : "";
      if (!artifactId) {
        return { ok: false, code: "invalid-args", message: "artifactId is required" };
      }
      const loaded = loadOrFail(ws);
      if (!loaded.ok) return loaded;
      const row = loaded.reg.artifactById.get(artifactId);
      if (!row) {
        return {
          ok: false,
          code: "cae-artifact-not-found",
          message: `Unknown artifactId '${artifactId}'`
        };
      }
      return {
        ok: true,
        code: "cae-get-artifact-ok",
        data: {
          schemaVersion: 1,
          artifact: row
        }
      };
    }

    if (name === "cae-list-activations") {
      const bad = requireSchemaV1(args);
      if (bad) return bad;
      const loaded = loadOrFail(ws);
      if (!loaded.ok) return loaded;
      const { reg } = loaded;
      let ids = [...reg.activationById.keys()].sort((a, b) => a.localeCompare(b));
      const fam = typeof args.family === "string" ? args.family.trim() : "";
      if (fam) {
        ids = ids.filter((id) => {
          const row = reg.activationById.get(id);
          return row && (row.family as string) === fam;
        });
      }
      const life = typeof args.lifecycleState === "string" ? args.lifecycleState.trim() : "";
      if (life) {
        ids = ids.filter((id) => {
          const row = reg.activationById.get(id);
          return row && (row.lifecycleState as string) === life;
        });
      }
      const { page, nextCursor } = paginateIds(ids, args.limit, args.cursor);
      return {
        ok: true,
        code: "cae-list-activations-ok",
        data: {
          schemaVersion: 1,
          activationIds: page,
          nextCursor
        }
      };
    }

    if (name === "cae-get-activation") {
      const bad = requireSchemaV1(args);
      if (bad) return bad;
      const activationId = typeof args.activationId === "string" ? args.activationId.trim() : "";
      if (!activationId) {
        return { ok: false, code: "invalid-args", message: "activationId is required" };
      }
      const loaded = loadOrFail(ws);
      if (!loaded.ok) return loaded;
      const row = loaded.reg.activationById.get(activationId);
      if (!row) {
        return {
          ok: false,
          code: "cae-activation-not-found",
          message: `Unknown activationId '${activationId}'`
        };
      }
      return {
        ok: true,
        code: "cae-get-activation-ok",
        data: {
          schemaVersion: 1,
          activation: row
        }
      };
    }

    return { ok: false, code: "unknown-command", message: `Unhandled command '${name}'` };
  }
};

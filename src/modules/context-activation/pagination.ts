import { Buffer } from "node:buffer";

import type { ModuleCommandResult } from "../../contracts/module-contract.js";

export function requireSchemaV1(args: Record<string, unknown>): ModuleCommandResult | null {
  if (args.schemaVersion !== 1) {
    return {
      ok: false,
      code: "invalid-args",
      message: "schemaVersion must be 1"
    };
  }
  return null;
}

export function decodeCursor(cursor: unknown): number {
  if (typeof cursor !== "string" || cursor.length === 0) return 0;
  try {
    const o = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as { o?: unknown };
    return typeof o?.o === "number" && o.o >= 0 ? Math.floor(o.o) : 0;
  } catch {
    return 0;
  }
}

export function encodeCursor(offset: number): string {
  return Buffer.from(JSON.stringify({ o: offset }), "utf8").toString("base64url");
}

export function paginateIds(
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

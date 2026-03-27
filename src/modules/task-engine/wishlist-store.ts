import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import type { WishlistItem, WishlistStoreDocument } from "./wishlist-types.js";
import { TaskEngineError } from "./transitions.js";
import type { SqliteDualPlanningStore } from "./sqlite-dual-planning.js";

export const DEFAULT_WISHLIST_PATH = ".workspace-kit/wishlist/state.json";

function emptyWishlistDoc(): WishlistStoreDocument {
  return {
    schemaVersion: 1,
    items: [],
    lastUpdated: new Date().toISOString()
  };
}

export type WishlistStorePersistence = {
  loadDocument: () => Promise<WishlistStoreDocument>;
  saveDocument: (doc: WishlistStoreDocument) => Promise<void>;
  pathLabel: string;
};

export class WishlistStore {
  private document: WishlistStoreDocument;
  private readonly persistence: WishlistStorePersistence;

  constructor(persistence: WishlistStorePersistence) {
    this.persistence = persistence;
    this.document = emptyWishlistDoc();
  }

  static forJsonFile(workspacePath: string, storeRelativePath?: string): WishlistStore {
    const filePath = path.resolve(workspacePath, storeRelativePath ?? DEFAULT_WISHLIST_PATH);
    return new WishlistStore({
      pathLabel: filePath,
      loadDocument: async () => {
        try {
          const raw = await fs.readFile(filePath, "utf8");
          const parsed = JSON.parse(raw) as WishlistStoreDocument;
          if (parsed.schemaVersion !== 1) {
            throw new TaskEngineError(
              "storage-read-error",
              `Unsupported wishlist schema version: ${parsed.schemaVersion}`
            );
          }
          if (!Array.isArray(parsed.items)) {
            throw new TaskEngineError("storage-read-error", "Wishlist store 'items' must be an array");
          }
          return parsed;
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code === "ENOENT") {
            return emptyWishlistDoc();
          }
          if (err instanceof TaskEngineError) {
            throw err;
          }
          throw new TaskEngineError(
            "storage-read-error",
            `Failed to read wishlist store: ${(err as Error).message}`
          );
        }
      },
      saveDocument: async (doc) => {
        const dir = path.dirname(filePath);
        const tmpPath = `${filePath}.${crypto.randomUUID().slice(0, 8)}.tmp`;
        try {
          await fs.mkdir(dir, { recursive: true });
          await fs.writeFile(tmpPath, JSON.stringify(doc, null, 2) + "\n", "utf8");
          await fs.rename(tmpPath, filePath);
        } catch (err) {
          try {
            await fs.unlink(tmpPath);
          } catch {
            /* cleanup best-effort */
          }
          throw new TaskEngineError(
            "storage-write-error",
            `Failed to write wishlist store: ${(err as Error).message}`
          );
        }
      }
    });
  }

  static forSqliteDual(dual: SqliteDualPlanningStore): WishlistStore {
    return new WishlistStore({
      pathLabel: `${dual.getDisplayPath()}#wishlist`,
      loadDocument: async () => dual.wishlistDocument,
      saveDocument: async (doc) => {
        dual.seedFromDocuments(dual.taskDocument, doc);
        dual.persistSync();
      }
    });
  }

  async load(): Promise<void> {
    this.document = await this.persistence.loadDocument();
  }

  async save(): Promise<void> {
    this.document.lastUpdated = new Date().toISOString();
    await this.persistence.saveDocument(this.document);
  }

  getAllItems(): WishlistItem[] {
    return [...this.document.items];
  }

  getItem(id: string): WishlistItem | undefined {
    return this.document.items.find((i) => i.id === id);
  }

  addItem(item: WishlistItem): void {
    if (this.document.items.some((i) => i.id === item.id)) {
      throw new TaskEngineError("duplicate-task-id", `Wishlist item '${item.id}' already exists`);
    }
    this.document.items.push({ ...item });
  }

  updateItem(item: WishlistItem): void {
    const idx = this.document.items.findIndex((i) => i.id === item.id);
    if (idx === -1) {
      throw new TaskEngineError("task-not-found", `Wishlist item '${item.id}' not found`);
    }
    this.document.items[idx] = { ...item };
  }

  getFilePath(): string {
    return this.persistence.pathLabel;
  }

  getLastUpdated(): string {
    return this.document.lastUpdated;
  }
}

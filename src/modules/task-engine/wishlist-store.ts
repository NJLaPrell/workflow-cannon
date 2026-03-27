import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import type { WishlistItem, WishlistStoreDocument } from "./wishlist-types.js";
import { TaskEngineError } from "./transitions.js";

const DEFAULT_WISHLIST_PATH = ".workspace-kit/wishlist/state.json";

function emptyWishlistDoc(): WishlistStoreDocument {
  return {
    schemaVersion: 1,
    items: [],
    lastUpdated: new Date().toISOString()
  };
}

export class WishlistStore {
  private document: WishlistStoreDocument;
  private readonly filePath: string;

  constructor(workspacePath: string, storeRelativePath?: string) {
    this.filePath = path.resolve(workspacePath, storeRelativePath ?? DEFAULT_WISHLIST_PATH);
    this.document = emptyWishlistDoc();
  }

  async load(): Promise<void> {
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
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
      this.document = parsed;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        this.document = emptyWishlistDoc();
        return;
      }
      if (err instanceof TaskEngineError) throw err;
      throw new TaskEngineError(
        "storage-read-error",
        `Failed to read wishlist store: ${(err as Error).message}`
      );
    }
  }

  async save(): Promise<void> {
    this.document.lastUpdated = new Date().toISOString();
    const dir = path.dirname(this.filePath);
    const tmpPath = `${this.filePath}.${crypto.randomUUID().slice(0, 8)}.tmp`;
    try {
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(tmpPath, JSON.stringify(this.document, null, 2) + "\n", "utf8");
      await fs.rename(tmpPath, this.filePath);
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
    return this.filePath;
  }

  getLastUpdated(): string {
    return this.document.lastUpdated;
  }
}

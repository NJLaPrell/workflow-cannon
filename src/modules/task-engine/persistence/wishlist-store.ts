import type { WishlistItem, WishlistStoreDocument } from "../wishlist/wishlist-types.js";
import { TaskEngineError } from "../transitions.js";
import type { SqliteDualPlanningStore } from "./sqlite-dual-planning.js";

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

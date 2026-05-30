import type { ServerResponse } from "node:http";
import type { DashboardServiceEvent } from "../../contracts/dashboard-events.js";

export type SseClient = {
  id: string;
  write: (event: DashboardServiceEvent) => void;
  close: () => void;
};

export class DashboardSseHub {
  private readonly clients = new Map<string, SseClient>();
  private nextId = 1;

  attach(res: ServerResponse): SseClient {
    const id = `sse-${this.nextId++}`;
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive"
    });
    res.write(": connected\n\n");

    const client: SseClient = {
      id,
      write: (event) => {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      },
      close: () => {
        this.clients.delete(id);
        res.end();
      }
    };
    this.clients.set(id, client);
    res.on("close", () => {
      this.clients.delete(id);
    });
    return client;
  }

  broadcast(event: DashboardServiceEvent): void {
    for (const client of this.clients.values()) {
      client.write(event);
    }
  }

  clientCount(): number {
    return this.clients.size;
  }

  closeAll(): void {
    for (const client of this.clients.values()) {
      client.close();
    }
    this.clients.clear();
  }
}

export function toSseEvent(input: {
  type: "slice.updated" | "snapshot.updated";
  slice?: string;
  changedSlices: string[];
  generation: number;
  updatedAt: string;
}): DashboardServiceEvent {
  if (input.type === "slice.updated" && input.slice) {
    return {
      type: "dashboard.slice.updated",
      generation: input.generation,
      slice: input.slice,
      updatedAt: input.updatedAt
    };
  }
  return {
    type: "dashboard.snapshot.updated",
    generation: input.generation,
    changedSlices: input.changedSlices,
    updatedAt: input.updatedAt
  };
}

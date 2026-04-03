import type { TaskEntity } from "../types.js";

/** Full graph when active task count is at or below this; larger workspaces use a capped subgraph. */
export const DASHBOARD_DEPENDENCY_FULL_GRAPH_CAP = 50;

/** Hard cap on nodes included when the graph is truncated. */
export const DASHBOARD_DEPENDENCY_TRUNCATED_NODE_CAP = 80;

/** Skip inline Mermaid text when there are too many edges (webview copy-paste / perf). */
export const DASHBOARD_DEPENDENCY_MERMAID_EDGE_CAP = 120;

export type DashboardDependencyOverviewV1 = {
  schemaVersion: 1;
  activeTaskCount: number;
  includedTaskCount: number;
  edgeCount: number;
  truncated: boolean;
  /** Human-readable perf / degradation note; null when full graph fits. */
  perfNote: string | null;
  nodes: { id: string; status: string }[];
  /** `from` depends on `to` (same convention as `get-dependency-graph`). */
  edges: { from: string; to: string }[];
  /**
   * Mermaid `flowchart TD` fragment (node ids sanitized). Empty string when omitted due to edge cap.
   */
  mermaidFlowchart: string;
  /**
   * Longest prerequisite chain among **ready** tasks in the included subgraph, ordered
   * **execution-first** (dependencies … then the ready task). Empty when there is no ready task.
   */
  criticalPathReady: string[];
};

function isActiveStatus(status: string): boolean {
  return status !== "completed" && status !== "cancelled";
}

function mermaidNodeId(taskId: string): string {
  return "n_" + taskId.replace(/[^a-zA-Z0-9_]/g, "_");
}

function buildEdgesForTasks(taskList: TaskEntity[]): { from: string; to: string }[] {
  const idSet = new Set(taskList.map((t) => t.id));
  const out: { from: string; to: string }[] = [];
  for (const task of taskList) {
    for (const depId of task.dependsOn ?? []) {
      if (idSet.has(depId)) {
        out.push({ from: task.id, to: depId });
      }
    }
  }
  out.sort((a, b) => (a.from === b.from ? a.to.localeCompare(b.to) : a.from.localeCompare(b.from)));
  return out;
}

function longestPrereqChain(
  taskId: string,
  byId: Map<string, TaskEntity>,
  memo: Map<string, string[]>
): string[] {
  const cached = memo.get(taskId);
  if (cached) {
    return cached;
  }
  const task = byId.get(taskId);
  const deps = (task?.dependsOn ?? []).filter((d) => byId.has(d));
  if (deps.length === 0) {
    const single = [taskId];
    memo.set(taskId, single);
    return single;
  }
  let best: string[] = [];
  for (const d of [...deps].sort()) {
    const sub = longestPrereqChain(d, byId, memo);
    if (sub.length > best.length || (sub.length === best.length && sub.join("\0") > best.join("\0"))) {
      best = sub;
    }
  }
  const chain = [...best, taskId];
  memo.set(taskId, chain);
  return chain;
}

function pickCriticalPathReady(readyIds: string[], byId: Map<string, TaskEntity>): string[] {
  let best: string[] = [];
  const memo = new Map<string, string[]>();
  for (const id of [...readyIds].sort()) {
    const chain = longestPrereqChain(id, byId, memo);
    if (chain.length > best.length || (chain.length === best.length && chain.join("\0") > best.join("\0"))) {
      best = chain;
    }
  }
  return best;
}

function collectTruncatedTaskIds(active: TaskEntity[]): Set<string> {
  const byId = new Map(active.map((t) => [t.id, t]));
  const seeds = active.filter((t) => t.status === "ready").map((t) => t.id);
  const out = new Set<string>();
  const stack = [...seeds];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (out.has(id)) {
      continue;
    }
    out.add(id);
    const t = byId.get(id);
    for (const d of t?.dependsOn ?? []) {
      if (byId.has(d)) {
        stack.push(d);
      }
    }
  }
  if (out.size === 0) {
    const slice = [...active].sort((a, b) => a.id.localeCompare(b.id)).slice(0, DASHBOARD_DEPENDENCY_TRUNCATED_NODE_CAP);
    for (const t of slice) {
      out.add(t.id);
    }
  }
  const sorted = [...out].sort((a, b) => a.localeCompare(b));
  if (sorted.length > DASHBOARD_DEPENDENCY_TRUNCATED_NODE_CAP) {
    const capped = new Set(sorted.slice(0, DASHBOARD_DEPENDENCY_TRUNCATED_NODE_CAP));
    return capped;
  }
  return out;
}

export function buildDashboardDependencyOverview(tasks: TaskEntity[]): DashboardDependencyOverviewV1 {
  const active = tasks.filter((t) => isActiveStatus(t.status));
  const truncated = active.length > DASHBOARD_DEPENDENCY_FULL_GRAPH_CAP;
  let included: TaskEntity[];
  let perfNote: string | null = null;

  if (!truncated) {
    included = active;
  } else {
    const idSet = collectTruncatedTaskIds(active);
    included = active.filter((t) => idSet.has(t.id));
    perfNote =
      `Large queue (${active.length} active tasks): showing dependency subgraph (${included.length} tasks, ready slice + prerequisite closure, cap ${DASHBOARD_DEPENDENCY_TRUNCATED_NODE_CAP}). For the full graph use workspace-kit run get-dependency-graph '{}'.`;
  }

  const nodes = included.map((t) => ({ id: t.id, status: t.status })).sort((a, b) => a.id.localeCompare(b.id));
  const edges = buildEdgesForTasks(included);
  const byId = new Map(included.map((t) => [t.id, t]));
  const readyInGraph = included.filter((t) => t.status === "ready").map((t) => t.id);
  const criticalPathReady = pickCriticalPathReady(readyInGraph, byId);

  let mermaidFlowchart = "";
  if (edges.length <= DASHBOARD_DEPENDENCY_MERMAID_EDGE_CAP) {
    const lines = ["flowchart TD"];
    for (const e of edges) {
      lines.push(`  ${mermaidNodeId(e.from)} --> ${mermaidNodeId(e.to)}`);
    }
    mermaidFlowchart = lines.join("\n");
  }

  return {
    schemaVersion: 1,
    activeTaskCount: active.length,
    includedTaskCount: included.length,
    edgeCount: edges.length,
    truncated,
    perfNote,
    nodes,
    edges,
    mermaidFlowchart,
    criticalPathReady
  };
}
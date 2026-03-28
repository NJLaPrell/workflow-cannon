import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { ViewModelDefinition, ViewModelSection, ViewRenderPolicy } from "./types.js";

function parseScalar(raw: string): string | number | boolean {
  const v = raw.trim();
  if (v === "true") return true;
  if (v === "false") return false;
  if (/^-?\d+$/.test(v)) return Number.parseInt(v, 10);
  return v.replace(/^"(.*)"$/, "$1");
}

function parseBlock(lines: string[], start: number, indent: number): { end: number; items: Record<string, unknown>[] } {
  const items: Record<string, unknown>[] = [];
  let idx = start;
  while (idx < lines.length) {
    const line = lines[idx];
    const currentIndent = line.search(/\S|$/);
    if (currentIndent < indent) break;
    const trimmed = line.trim();
    if (!trimmed.startsWith("- ")) {
      idx += 1;
      continue;
    }
    const item: Record<string, unknown> = {};
    const first = trimmed.slice(2);
    if (first.includes(":")) {
      const split = first.indexOf(":");
      const k = first.slice(0, split).trim();
      const v = first.slice(split + 1).trim();
      item[k] = parseScalar(v);
    }
    idx += 1;
    while (idx < lines.length) {
      const next = lines[idx];
      const nextIndent = next.search(/\S|$/);
      if (nextIndent <= currentIndent) break;
      const t = next.trim();
      const split = t.indexOf(":");
      if (split > 0) {
        const k = t.slice(0, split).trim();
        const v = t.slice(split + 1).trim();
        item[k] = parseScalar(v);
      }
      idx += 1;
    }
    items.push(item);
  }
  return { end: idx, items };
}

function parseViewModelYaml(text: string): ViewModelDefinition {
  const lines = text
    .split("\n")
    .map((l) => l.replace(/\t/g, "  "))
    .filter((l) => l.trim().length > 0 && !l.trim().startsWith("#"));
  const root: Record<string, unknown> = {};
  let idx = 0;
  while (idx < lines.length) {
    const line = lines[idx];
    const trimmed = line.trim();
    const split = trimmed.indexOf(":");
    if (split <= 0) {
      idx += 1;
      continue;
    }
    const key = trimmed.slice(0, split).trim();
    const value = trimmed.slice(split + 1).trim();
    if (!value) {
      const parsed = parseBlock(lines, idx + 1, line.search(/\S|$/) + 2);
      root[key] = parsed.items;
      idx = parsed.end;
      continue;
    }
    root[key] = parseScalar(value);
    idx += 1;
  }

  const sections = (root["sections"] as Record<string, unknown>[] | undefined) ?? [];
  const renderPolicies = (root["render_policies"] as Record<string, unknown>[] | undefined) ?? [];
  return {
    id: String(root["id"] ?? ""),
    version: Number(root["version"] ?? 1),
    docType: String(root["doc_type"] ?? ""),
    target: String(root["target"] ?? ""),
    profile: root["source_profile"] as ViewModelDefinition["profile"],
    sections: sections.map(
      (s) =>
        ({
          id: String(s["id"] ?? ""),
          title: s["title"] ? String(s["title"]) : undefined,
          description: s["description"] ? String(s["description"]) : undefined,
          renderer: String(s["renderer"] ?? ""),
          source: String(s["source"] ?? "meta") as ViewModelSection["source"],
          template: s["template"] ? String(s["template"]) : undefined
        }) satisfies ViewModelSection
    ),
    renderPolicies: renderPolicies.map(
      (p) =>
        ({
          id: String(p["id"] ?? ""),
          mode: String(p["mode"] ?? "append") as ViewRenderPolicy["mode"],
          when: p["when"] ? String(p["when"]) : undefined
        }) satisfies ViewRenderPolicy
    )
  };
}

export async function loadViewModel(workspacePath: string, viewFile: string): Promise<ViewModelDefinition> {
  const fullPath = resolve(workspacePath, "src/modules/documentation/views", viewFile);
  const content = await readFile(fullPath, "utf8");
  return parseViewModelYaml(content);
}

export async function listViewModels(workspacePath: string): Promise<string[]> {
  const viewsPath = resolve(workspacePath, "src/modules/documentation/views");
  const entries = await readdir(viewsPath, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && e.name.endsWith(".view.yaml"))
    .map((e) => e.name)
    .sort();
}

/**
 * Extract merged `args` JSON Schema from `task-engine-run-contracts.schema.json`.
 * Keep behavior aligned with `scripts/lib/extract-contract-args.mjs` (refresh + check scripts).
 */

export function resolveJsonPointer(root: unknown, ref: string): unknown {
  if (!ref.startsWith("#/")) {
    throw new Error(`Unsupported ref (expected #/…): ${ref}`);
  }
  const parts = ref.slice(2).split("/").map((p) => p.replace(/~1/g, "/").replace(/~0/g, "~"));
  let cur: unknown = root;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") {
      throw new Error(`Broken ref path ${ref} at ${p}`);
    }
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

function resolveNode(root: unknown, node: Record<string, unknown>): Record<string, unknown> {
  if (typeof node.$ref === "string") {
    return resolveNode(root, resolveJsonPointer(root, node.$ref) as Record<string, unknown>);
  }
  return node;
}

function mergeArgFragments(base: Record<string, unknown>, next: Record<string, unknown>): Record<string, unknown> {
  const out = { ...base };
  if (next.type !== undefined) {
    out.type = next.type;
  }
  if (Array.isArray(next.required)) {
    const prev = Array.isArray(out.required) ? (out.required as string[]) : [];
    out.required = [...new Set([...prev, ...(next.required as string[])])];
  }
  if (next.properties && typeof next.properties === "object" && !Array.isArray(next.properties)) {
    out.properties = {
      ...(typeof out.properties === "object" && out.properties !== null && !Array.isArray(out.properties)
        ? (out.properties as Record<string, unknown>)
        : {}),
      ...(next.properties as Record<string, unknown>)
    };
  }
  if (next.additionalProperties === false) {
    out.additionalProperties = false;
  } else if (next.additionalProperties === true && out.additionalProperties !== false) {
    out.additionalProperties = true;
  }
  if (next.oneOf !== undefined) {
    out.oneOf = next.oneOf;
  }
  if (next.anyOf !== undefined) {
    out.anyOf = next.anyOf;
  }
  if (next.allOf !== undefined) {
    out.allOf = next.allOf;
  }
  return out;
}

export function mergeArgsSchemaFromContract(root: unknown, contract: Record<string, unknown>): Record<string, unknown> {
  const resolved = resolveNode(root, contract) as Record<string, unknown>;
  const allOf = resolved.allOf;
  if (!Array.isArray(allOf)) {
    const props = resolved.properties as Record<string, unknown> | undefined;
    const args = props?.args as Record<string, unknown> | undefined;
    return args && typeof args === "object" ? structuredClone(args) : { type: "object" };
  }

  let merged: Record<string, unknown> = { type: "object" };
  for (const frag of allOf) {
    if (!frag || typeof frag !== "object") {
      continue;
    }
    const r = resolveNode(root, frag as Record<string, unknown>) as Record<string, unknown>;
    const rProps = r.properties as Record<string, unknown> | undefined;
    const args = rProps?.args as Record<string, unknown> | undefined;
    if (!args || typeof args !== "object" || Array.isArray(args)) {
      continue;
    }
    merged = mergeArgFragments(merged, args);
  }
  return merged;
}

export function extractCommandArgsSchema(root: Record<string, unknown>, commandName: string): Record<string, unknown> {
  const commands = (root as { properties?: { commands?: { properties?: Record<string, unknown> } } }).properties
    ?.commands?.properties;
  if (!commands || typeof commands !== "object") {
    throw new Error("Invalid schema: missing properties.commands.properties");
  }
  const entry = commands[commandName];
  if (!entry) {
    throw new Error(`Unknown command '${commandName}' in schema`);
  }
  const contract = resolveNode(root, entry as Record<string, unknown>);
  return mergeArgsSchemaFromContract(root, contract);
}

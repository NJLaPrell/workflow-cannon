#!/usr/bin/env node
/**
 * Extract merged `args` JSON Schema from task-engine-run-contracts.schema.json
 * for a command (resolves $ref, merges allOf fragments).
 */

/** @param {unknown} root */
/** @param {string} ref */
export function resolveJsonPointer(root, ref) {
  if (!ref.startsWith("#/")) {
    throw new Error(`Unsupported ref (expected #/…): ${ref}`);
  }
  const parts = ref.slice(2).split("/").map((p) => p.replace(/~1/g, "/").replace(/~0/g, "~"));
  let cur = root;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") {
      throw new Error(`Broken ref path ${ref} at ${p}`);
    }
    cur = /** @type {Record<string, unknown>} */ (cur)[p];
  }
  return cur;
}

/**
 * @param {unknown} root schema root
 * @param {Record<string, unknown>} node
 */
function resolveNode(root, node) {
  if (typeof node.$ref === "string") {
    return /** @type {Record<string, unknown>} */ (resolveJsonPointer(root, node.$ref));
  }
  return node;
}

/**
 * Shallow merge JSON Schema `args` objects from allOf chain.
 * @param {unknown} root
 * @param {Record<string, unknown>} contract resolved command contract (e.g. contractRunTransition)
 */
export function mergeArgsSchemaFromContract(root, contract) {
  const resolved = resolveNode(root, contract);
  const allOf = resolved.allOf;
  if (!Array.isArray(allOf)) {
    const args = resolved.properties?.args;
    return args && typeof args === "object" ? structuredClone(args) : { type: "object" };
  }

  /** @type {Record<string, unknown>} */
  let merged = { type: "object" };
  for (const frag of allOf) {
    if (!frag || typeof frag !== "object") continue;
    const r = resolveNode(root, /** @type {Record<string, unknown>} */ (frag));
    const args = r.properties?.args;
    if (!args || typeof args !== "object" || Array.isArray(args)) continue;
    const a = /** @type {Record<string, unknown>} */ (args);
    merged = mergeArgFragments(merged, a);
  }
  return merged;
}

/**
 * @param {Record<string, unknown>} base
 * @param {Record<string, unknown>} next
 */
function mergeArgFragments(base, next) {
  const out = { ...base };
  if (next.type !== undefined) out.type = next.type;
  if (Array.isArray(next.required)) {
    const prev = Array.isArray(out.required) ? out.required : [];
    out.required = [...new Set([...prev, ...next.required])];
  }
  if (next.properties && typeof next.properties === "object" && !Array.isArray(next.properties)) {
    out.properties = {
      ...(typeof out.properties === "object" && out.properties !== null && !Array.isArray(out.properties)
        ? /** @type {Record<string, unknown>} */ (out.properties)
        : {}),
      .../** @type {Record<string, unknown>} */ (next.properties)
    };
  }
  if (next.additionalProperties === false) {
    out.additionalProperties = false;
  } else if (next.additionalProperties === true && out.additionalProperties !== false) {
    out.additionalProperties = true;
  }
  if (next.oneOf !== undefined) out.oneOf = next.oneOf;
  if (next.anyOf !== undefined) out.anyOf = next.anyOf;
  if (next.allOf !== undefined) out.allOf = next.allOf;
  return out;
}

/**
 * @param {unknown} root full task-engine-run-contracts.schema.json
 * @param {string} commandName
 */
export function extractCommandArgsSchema(root, commandName) {
  const commands = root?.properties?.commands?.properties;
  if (!commands || typeof commands !== "object") {
    throw new Error("Invalid schema: missing properties.commands.properties");
  }
  const entry = /** @type {Record<string, unknown> | undefined} */ (commands)[commandName];
  if (!entry) {
    throw new Error(`Unknown command '${commandName}' in schema`);
  }
  const contract = resolveNode(root, /** @type {Record<string, unknown>} */ (entry));
  return mergeArgsSchemaFromContract(root, contract);
}

export function readQueueNamespaceArg(args: Record<string, unknown>): string | undefined {
  const q = args.queueNamespace;
  return typeof q === "string" && q.trim().length > 0 ? q.trim() : undefined;
}

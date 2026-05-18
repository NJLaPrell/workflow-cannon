/** Stable discovery hints for agents when `wk run` argv or policy fails. */
export const CLI_DISCOVERY_HINTS = {
  listCommands: "pnpm exec wk run --list-commands",
  listCommandsAlias: "pnpm exec wk run list-commands '{}'",
  schemaOnly: "pnpm exec wk run <command> --schema-only '{}'",
  jsonCatalog: "pnpm exec wk run --json"
} as const;

export function cliDiscoveryEnvelope(): Record<string, string> {
  return {
    listCommands: CLI_DISCOVERY_HINTS.listCommands,
    schemaOnly: CLI_DISCOVERY_HINTS.schemaOnly
  };
}

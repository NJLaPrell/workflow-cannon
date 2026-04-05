/** Parsed + validated Claude-layout plugin manifest (plugin.json). */
export type ClaudePluginManifest = {
  name: string;
  version?: string;
  description?: string;
  author?: string | Record<string, unknown>;
  homepage?: string;
  repository?: string | Record<string, unknown>;
  license?: string;
  keywords?: string[];
  commands?: string | string[];
  agents?: string | string[];
  hooks?: string | Record<string, unknown>;
  mcpServers?: string | Record<string, unknown>;
};

export type PluginPathDiagnostic = {
  field: string;
  message: string;
};

export type PluginDiscoveryRecord = {
  name: string;
  version: string | null;
  description: string | null;
  rootPath: string;
  rootRelativePath: string;
  manifestPathRelative: string;
  manifest: ClaudePluginManifest | null;
  manifestValid: boolean;
  manifestErrors: string[];
  pathDiagnostics: PluginPathDiagnostic[];
};

import type {
  ModuleCommand,
  ModuleCommandResult,
  ModuleInstructionEntry,
  ModuleLifecycleContext,
  WorkflowModule
} from "../contracts/module-contract.js";
import {
  classifyInstructionExecution,
  isInstructionExecutableForRegistry
} from "./agent-instruction-surface.js";
import { ModuleRegistry } from "./module-registry.js";

export type ModuleCommandDescriptor = {
  name: string;
  moduleId: string;
  instructionFile: string;
  description?: string;
};

export type ModuleCommandRouterOptions = {
  aliases?: Record<string, string>;
};

export class ModuleCommandRouterError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ModuleCommandRouterError";
    this.code = code;
  }
}

/** Cap unknown-command error text when the router lists hundreds of module commands. */
export const UNKNOWN_COMMAND_SAMPLE_LIMIT = 15;

export function formatUnknownCommandMessage(attempted: string, allNames: string[]): string {
  const sorted = [...allNames].sort((a, b) => a.localeCompare(b));
  const n = sorted.length;
  const cap = UNKNOWN_COMMAND_SAMPLE_LIMIT;
  const shown = sorted.slice(0, cap);
  const omitted = n > cap ? ` … and ${n - cap} more (not listed)` : "";
  const sample = shown.join(", ");
  return (
    `Unknown command '${attempted}'. Sample of ${Math.min(n, cap)}/${n}: ${sample}${omitted}. ` +
    "Run `workspace-kit run` with no subcommand (or `wk doctor --agent-instruction-surface`) for the full catalog."
  );
}

type IndexedCommand = {
  descriptor: ModuleCommandDescriptor;
  module: WorkflowModule;
  entry: ModuleInstructionEntry;
};

export class ModuleCommandRouter {
  private readonly commands = new Map<string, IndexedCommand>();
  private readonly aliases: Record<string, string>;
  private readonly registry: ModuleRegistry;

  constructor(registry: ModuleRegistry, options?: ModuleCommandRouterOptions) {
    this.registry = registry;
    this.aliases = options?.aliases ?? {};
    this.indexEnabledModuleCommands();
    this.validateAliases();
  }

  listCommands(): ModuleCommandDescriptor[] {
    return [...this.commands.values()]
      .map((entry) => entry.descriptor)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  describeCommand(name: string): ModuleCommandDescriptor | undefined {
    const commandName = this.resolveCommandName(name);
    return this.commands.get(commandName)?.descriptor;
  }

  async execute(
    name: string,
    args: Record<string, unknown> | undefined,
    ctx: ModuleLifecycleContext
  ): Promise<ModuleCommandResult> {
    const commandName = this.resolveCommandName(name);
    const indexed = this.commands.get(commandName);
    if (!indexed) {
      const names = this.listCommands().map((command) => command.name);
      throw new ModuleCommandRouterError(
        "unknown-command",
        formatUnknownCommandMessage(name, names)
      );
    }

    if (!this.registry.isModuleEnabled(indexed.descriptor.moduleId)) {
      throw new ModuleCommandRouterError(
        "disabled-module",
        `Module '${indexed.descriptor.moduleId}' is disabled for command '${commandName}'`
      );
    }

    if (!indexed.module.onCommand) {
      throw new ModuleCommandRouterError(
        "command-not-implemented",
        `Module '${indexed.descriptor.moduleId}' does not implement onCommand for '${commandName}'`
      );
    }

    if (!isInstructionExecutableForRegistry(indexed.module, indexed.entry, this.registry)) {
      const deg = classifyInstructionExecution(indexed.module, indexed.entry, this.registry);
      const detail =
        deg.kind === "peer_disabled"
          ? `missing peers: ${deg.missingPeers.join(", ")}`
          : deg.kind === "module_disabled"
            ? "owning module disabled"
            : "not executable";
      return {
        ok: false,
        code: "peer-module-disabled",
        message: `Command '${commandName}' is not executable (${detail}). Enable required modules or follow the instruction markdown for manual guidance. Instruction: ${indexed.descriptor.instructionFile}`,
        remediation: {
          instructionPath: indexed.descriptor.instructionFile.replace(/\\/g, "/")
        }
      };
    }

    const command: ModuleCommand = {
      name: commandName,
      args
    };
    return indexed.module.onCommand(command, ctx);
  }

  private indexEnabledModuleCommands(): void {
    for (const module of this.registry.getEnabledModules()) {
      for (const entry of module.registration.instructions.entries) {
        if (!isInstructionExecutableForRegistry(module, entry, this.registry)) {
          continue;
        }
        if (this.commands.has(entry.name)) {
          const existing = this.commands.get(entry.name);
          throw new ModuleCommandRouterError(
            "duplicate-command",
            `Command '${entry.name}' is declared by both '${existing?.descriptor.moduleId}' and '${module.registration.id}'`
          );
        }
        this.commands.set(entry.name, {
          descriptor: {
            name: entry.name,
            moduleId: module.registration.id,
            instructionFile: `${module.registration.instructions.directory}/${entry.file}`,
            description: entry.description
          },
          module,
          entry
        });
      }
    }
  }

  private validateAliases(): void {
    for (const [alias, commandName] of Object.entries(this.aliases)) {
      if (alias === commandName) {
        throw new ModuleCommandRouterError(
          "invalid-alias",
          `Alias '${alias}' cannot map to itself`
        );
      }
      if (!this.commands.has(commandName)) {
        throw new ModuleCommandRouterError(
          "unknown-alias-target",
          `Alias '${alias}' maps to unknown command '${commandName}'`
        );
      }
      if (this.commands.has(alias)) {
        throw new ModuleCommandRouterError(
          "alias-conflict",
          `Alias '${alias}' conflicts with a declared command`
        );
      }
    }
  }

  private resolveCommandName(name: string): string {
    return this.aliases[name] ?? name;
  }
}

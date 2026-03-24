import type {
  ModuleCommand,
  ModuleCommandResult,
  ModuleLifecycleContext,
  WorkflowModule
} from "../contracts/module-contract.js";
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

type IndexedCommand = {
  descriptor: ModuleCommandDescriptor;
  module: WorkflowModule;
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
      const known = this.listCommands()
        .map((command) => command.name)
        .join(", ");
      throw new ModuleCommandRouterError(
        "unknown-command",
        `Unknown command '${name}'. Known commands: ${known || "none"}`
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

    const command: ModuleCommand = {
      name: commandName,
      args
    };
    return indexed.module.onCommand(command, ctx);
  }

  private indexEnabledModuleCommands(): void {
    for (const module of this.registry.getEnabledModules()) {
      for (const entry of module.registration.instructions.entries) {
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
          module
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

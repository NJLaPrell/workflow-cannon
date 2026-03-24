# Modules

Each module should:

- implement `WorkflowModule` from `src/contracts/module-contract.ts`
- declare explicit dependencies and capabilities
- define config and state contracts as markdown files in the module directory
- define function-like instruction files under `instructions/` (for command-style module entrypoints)
- set `enabledByDefault` and allow runtime enable/disable control through module registry options
- avoid direct imports from sibling modules

Instruction contract convention:

- each instruction entry name should be function-like (example: `document-project`)
- each instruction entry maps to a markdown file in `instructions/` (example: `document-project.md`)
- instruction entries declared in module registration should correspond to existing files

Current planned modules:

- `documentation/`
- `task-engine/`
- `planning/`
- `improvement/`
- `approvals/`

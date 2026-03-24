# Modules

Each module should:

- implement `WorkflowModule` from `src/contracts/module-contract.ts`
- declare explicit dependencies and capabilities
- avoid direct imports from sibling modules

Current planned modules:

- `task-engine/`
- `planning/`
- `improvement/`
- `approvals/`

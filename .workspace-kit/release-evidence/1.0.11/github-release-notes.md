## Hard-merge Ideas into Planning

This release delivers **Hard-merge Ideas into Planning**.

### ✨ Highlights

- Idea CRUD and brainstorm session logic now live under the planning module, reducing circular imports while keeping all ideas commands unchanged.
- Planning and Ideas commands now route through one shared dispatcher while both modules stay registered as thin rollback shells.
- Planner merge contract gates now assert frozen command codes, empty first run behavior, and MCP tool name stability across golden path, standalone PlanArtifact,
- Ideas era planner command instruction docs now live under planning/instructions; MCP and agent playbooks point at the new paths ahead of the moduleId registry f
- MCP planner routing and dashboard imports now use Planning module authority; extension lifecycle helper stays aligned with planning canonical.

---

_Technical changelog: [`docs/maintainers/CHANGELOG.md`](docs/maintainers/CHANGELOG.md)_

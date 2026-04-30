/** Re-export: validation lives in `core/skills` so other modules avoid sibling `modules/skills` imports (REF-004). */
export { readTaskSkillIds, validateTaskSkillAttachments } from "../../core/skills/task-skill-validation.js";

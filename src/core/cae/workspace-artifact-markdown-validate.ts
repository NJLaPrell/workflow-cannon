/**
 * Lightweight structural validation for workspace CAE markdown (T100093).
 */

export type WorkspaceMarkdownValidationResult =
  | { ok: true }
  | { ok: false; code: string; message: string };

/**
 * Require a non-empty body and at least one markdown H1 line (`# ...`).
 * Optional `fragment` is a registry fragment id (not a `#heading`); when set, require a matching `## fragment` section line.
 */
export function validateWorkspaceArtifactMarkdown(input: {
  contentMarkdown: string;
  title: string;
  fragment?: string | null;
}): WorkspaceMarkdownValidationResult {
  const md = typeof input.contentMarkdown === "string" ? input.contentMarkdown : "";
  if (!md.trim()) {
    return {
      ok: false,
      code: "cae-workspace-artifact-markdown-empty",
      message: "Workspace artifact markdown must not be empty"
    };
  }
  const hasH1 = /(^|\n)#[^#\s].*($|\n)/.test(md) || /(^|\n)#\s+\S/.test(md);
  if (!hasH1) {
    return {
      ok: false,
      code: "cae-workspace-artifact-markdown-heading",
      message: "Workspace artifact markdown must include at least one H1 heading line starting with '# '"
    };
  }
  const frag = typeof input.fragment === "string" ? input.fragment.trim() : "";
  if (frag.length > 0) {
    const escaped = frag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const section = new RegExp(`(^|\n)##\\s+${escaped}\\s*($|\n)`);
    if (!section.test(md)) {
      return {
        ok: false,
        code: "cae-workspace-artifact-markdown-fragment",
        message: `Workspace artifact markdown must include an H2 section heading '## ${frag}' matching the fragment id`
      };
    }
  }
  const title = typeof input.title === "string" ? input.title.trim() : "";
  if (!title) {
    return { ok: false, code: "cae-workspace-artifact-markdown-title", message: "title is required" };
  }
  return { ok: true };
}

/**
 * Dashboard "Complete & Release" — prefills Cursor chat for phase closeout.
 */
export function buildPhaseCompleteReleaseChatPrompt(phasePhrase: string): string {
  const p = phasePhrase.trim();
  const q = p.length > 0 ? p : "this phase";
  return `Read the project documentation and complete all ${q} tasks, then build, publish, and release ${q}. I approve.`;
}

import type {
  NormalizedCheck,
  NormalizedCommand,
  NormalizedDecision,
  NormalizedDocument,
  NormalizedRule,
  NormalizedTerm,
  NormalizedWorkflow,
  ViewModelDefinition,
  ViewModelSection
} from "./types.js";

function stableSort(values: string[]): string[] {
  return [...values].sort((a, b) => a.localeCompare(b));
}

export function brief_summary(input: string[]): string {
  if (input.length === 0) return "No summary records.";
  return input.map((line) => `- ${line}`).join("\n");
}

export function ordered_list(input: string[]): string {
  if (input.length === 0) return "1. No entries";
  return input.map((line, idx) => `${idx + 1}. ${line}`).join("\n");
}

export function rule_table(rules: NormalizedRule[]): string {
  if (rules.length === 0) return "_No rules_";
  const rows = [...rules].sort((a, b) => a.id.localeCompare(b.id));
  const body = rows
    .map((r) => `| ${r.id} | ${r.level} | ${r.scope || "-"} | ${r.directive || "-"} | ${r.why || "-"} |`)
    .join("\n");
  return `| ID | Level | Scope | Directive | Why |\n|---|---|---|---|---|\n${body}`;
}

export function check_table(checks: NormalizedCheck[]): string {
  if (checks.length === 0) return "_No checks_";
  const rows = [...checks].sort((a, b) => a.id.localeCompare(b.id));
  const body = rows
    .map((c) => `| ${c.id} | ${c.scope || "-"} | ${c.assertion || "-"} | ${c.onFail || "-"} |`)
    .join("\n");
  return `| ID | Scope | Assertion | On Fail |\n|---|---|---|---|\n${body}`;
}

export function command_reference(commands: NormalizedCommand[]): string {
  if (commands.length === 0) return "_No commands_";
  const rows = [...commands].sort((a, b) => a.name.localeCompare(b.name));
  return rows.map((c) => `- \`${c.name}\`: ${c.expectation || c.use || "No expectation"}`).join("\n");
}

export function decision_section(decisions: NormalizedDecision[]): string {
  if (decisions.length === 0) return "_No decisions_";
  const rows = [...decisions].sort((a, b) => a.id.localeCompare(b.id));
  return rows.map((d) => `### ${d.id}: ${d.topic}\n- Choice: ${d.choice}\n- Why: ${d.why}`).join("\n\n");
}

export function term_list(terms: NormalizedTerm[]): string {
  if (terms.length === 0) return "_No terms_";
  return [...terms]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((t) => `- **${t.name}**: ${t.definition}`)
    .join("\n");
}

export function workflow_steps(workflows: NormalizedWorkflow[]): string {
  if (workflows.length === 0) return "_No workflows_";
  return workflows
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((wf) => `### ${wf.id}: ${wf.name}\n${ordered_list(stableSort(wf.steps))}`)
    .join("\n\n");
}

export function chain_steps(chains: Array<{ step: string; command: string; expectExit: number }>): string {
  if (chains.length === 0) return "_No chain steps_";
  return chains
    .map((c, idx) => `${idx + 1}. ${c.step} -> \`${c.command}\` (expect ${c.expectExit})`)
    .join("\n");
}

export function ref_table(refs: Array<{ id: string; type: string; target: string }>): string {
  if (refs.length === 0) return "_No refs_";
  const body = [...refs]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((r) => `| ${r.id} | ${r.type} | ${r.target} |`)
    .join("\n");
  return `| ID | Type | Target |\n|---|---|---|\n${body}`;
}

export const renderMetaSection = (doc: NormalizedDocument) =>
  brief_summary([
    `doc=${doc.meta?.doc ?? "unknown"}`,
    `truth=${doc.meta?.truth ?? "unknown"}`,
    `profile=${doc.meta?.profile ?? "core"}`
  ]);
export const renderRuleSection = (doc: NormalizedDocument) => rule_table(doc.rules);
export const renderDecisionSection = (doc: NormalizedDocument) => decision_section(doc.decisions);

function renderSection(doc: NormalizedDocument, section: ViewModelSection): string {
  const byName: Record<string, (d: NormalizedDocument) => string> = {
    renderMetaSection,
    renderRuleSection,
    renderDecisionSection,
    brief_summary: (d) => brief_summary(d.examples.map((e) => e.text)),
    ordered_list: (d) => ordered_list(d.commands.map((c) => c.name)),
    rule_table: (d) => rule_table(d.rules),
    check_table: (d) => check_table(d.checks),
    command_reference: (d) => command_reference(d.commands),
    decision_section: (d) => decision_section(d.decisions),
    term_list: (d) => term_list(d.terms),
    workflow_steps: (d) => workflow_steps(d.workflows),
    chain_steps: (d) => chain_steps(d.chains),
    ref_table: (d) => ref_table(d.refs)
  };
  const fn = byName[section.renderer] ?? (() => "_No renderer_");
  const title = section.title ?? section.id;
  return `## ${title}\n\n${fn(doc)}`;
}

export function renderDocument(doc: NormalizedDocument, view: ViewModelDefinition): string {
  return view.sections.map((s) => renderSection(doc, s)).join("\n\n").trim() + "\n";
}

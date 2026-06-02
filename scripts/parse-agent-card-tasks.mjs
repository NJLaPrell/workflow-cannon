import fs from 'node:fs';
import path from 'node:path';

const content = fs.readFileSync('AGENT_CARD_PLAN.md', 'utf8');

// Find all ### T-AC- headings
const matches = [...content.matchAll(/### (T-AC-\d+) — ([^\n]+)/g)];

const tasks = [];
for (let i = 0; i < matches.length; i++) {
  const match = matches[i];
  const wbsId = match[1];
  const title = match[2].trim();
  
  // Find section content up to the next ### T-AC- or end of section
  const startIndex = match.index + match[0].length;
  const endIndex = i < matches.length - 1 ? matches[i + 1].index : content.length;
  const sectionContent = content.slice(startIndex, endIndex);

  // Parse fields
  const typeMatch = sectionContent.match(/\*\*Type:\*\* ([^\n]+)/);
  const priorityMatch = sectionContent.match(/\*\*Priority:\*\* ([^\n]+)/);
  const phaseMatch = sectionContent.match(/\*\*Suggested phase:\*\* ([^\n]+)/);
  const requiresMatch = sectionContent.match(/\*\*Requires:\*\* ([^\n]+)/);
  
  const type = typeMatch ? typeMatch[1].trim() : 'workspace-kit';
  const priority = priorityMatch ? priorityMatch[1].trim() : 'P1';
  const phase = phaseMatch ? phaseMatch[1].trim() : 'Phase 129';
  const requires = requiresMatch ? requiresMatch[1].split(',').map(x => x.trim()) : [];

  // Parse scope
  const scopeStart = sectionContent.indexOf('**Scope**');
  let scope = [];
  if (scopeStart !== -1) {
    const scopeEnd = sectionContent.indexOf('**Acceptance criteria**');
    const scopeText = sectionContent.slice(scopeStart, scopeEnd !== -1 ? scopeEnd : sectionContent.length);
    scope = [...scopeText.matchAll(/- ([^\n]+)/g)].map(x => x[1].trim());
  }

  // Parse AC
  const acStart = sectionContent.indexOf('**Acceptance criteria**');
  let ac = [];
  if (acStart !== -1) {
    const acText = sectionContent.slice(acStart);
    ac = [...acText.matchAll(/- ([^\n]+)/g)].map(x => x[1].trim());
  }

  // Fallback approach/summary
  const valueMatch = sectionContent.match(/\*\*Value:\*\* ([^\n]+)/);
  const approach = valueMatch ? valueMatch[1].trim() : title;

  tasks.push({
    wbsId,
    title,
    type,
    priority,
    phase,
    requires,
    approach,
    technicalScope: scope,
    acceptanceCriteria: ac
  });
}

fs.writeFileSync('parsed_agent_card_tasks.json', JSON.stringify(tasks, null, 2));
console.log(`Successfully parsed ${tasks.length} tasks from AGENT_CARD_PLAN.md`);

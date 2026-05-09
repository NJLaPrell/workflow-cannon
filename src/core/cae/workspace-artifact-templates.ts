/**
 * Starter markdown templates for workspace CAE artifacts (CAEUX templates / T100093).
 */

import type { CaeWorkspaceArtifactType } from "./workspace-artifact-conventions.js";
import { CAE_WORKSPACE_ARTIFACT_TYPES } from "./workspace-artifact-conventions.js";

export type WorkspaceArtifactTemplateV1 = {
  id: string;
  artifactType: CaeWorkspaceArtifactType;
  title: string;
  contentMarkdown: string;
};

const TEMPLATES: WorkspaceArtifactTemplateV1[] = [
  {
    id: "starter-playbook",
    artifactType: "playbook",
    title: "Playbook starter",
    contentMarkdown: `# Playbook title

## Overview

Describe when operators should use this playbook.

## Steps

1. 
2. 

## References

- 
`
  },
  {
    id: "starter-runbook",
    artifactType: "runbook",
    title: "Runbook starter",
    contentMarkdown: `# Runbook title

## Trigger

When does this runbook apply?

## Procedure

1. 
2. 

## Rollback

- 
`
  },
  {
    id: "starter-checklist",
    artifactType: "checklist",
    title: "Checklist starter",
    contentMarkdown: `# Checklist title

## Before you start

- [ ] 

## Execution

- [ ] 
- [ ] 

## Sign-off

- [ ] Verified by:
`
  },
  {
    id: "starter-review-template",
    artifactType: "review-template",
    title: "Review template starter",
    contentMarkdown: `# Review template

## Scope

What is being reviewed?

## Checklist

- [ ] Correctness
- [ ] Safety
- [ ] Operability

## Notes

`
  },
  {
    id: "starter-reasoning-template",
    artifactType: "reasoning-template",
    title: "Reasoning template starter",
    contentMarkdown: `# Reasoning template

## Context

## Constraints

## Recommended path

`
  },
  {
    id: "starter-policy-doc",
    artifactType: "policy-doc",
    title: "Policy doc starter",
    contentMarkdown: `# Policy title

## Intent

## Rules

1. 

## Exceptions

`
  }
];

export function listWorkspaceArtifactTemplatesV1(): WorkspaceArtifactTemplateV1[] {
  return TEMPLATES.filter((t) => CAE_WORKSPACE_ARTIFACT_TYPES.includes(t.artifactType));
}

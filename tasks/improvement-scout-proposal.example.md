# Example: improvement task from a scout pass (prompt-only)

This file is **not** executed by the kit. When **`create-task`** logs a scout-origin **`type: "improvement"`** row, optional **`metadata`** can include:

```json
{
  "type": "improvement",
  "title": "Example scout finding",
  "metadata": {
    "issue": "Operator friction: unclear recovery when …",
    "supportingReasoning": "See scout pass 2026-04-05; anchors below.",
    "primaryLens": "operator-friction",
    "adversarialLens": "policy-confusion",
    "findingType": "doc-gap",
    "evidenceAnchors": [
      "docs/maintainers/AGENT-CLI-MAP.md",
      "src/modules/improvement/instructions/generate-recommendations.md"
    ],
    "riskNotes": "Low severity; discoverability only.",
    "noveltyHint": "likely-new"
  }
}
```

Playbook: **`improvement-scout`** (`docs/maintainers/playbooks/improvement-scout.md`).

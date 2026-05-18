import fs from "node:fs";
import path from "node:path";
import { listMemoryRecords } from "./memory-store.js";

export type MemoryPrecedenceLayer = {
  layer: string;
  role: string;
  paths: string[];
  winsOver: string[];
};

export function explainMemoryPrecedence(workspacePath: string): {
  layers: MemoryPrecedenceLayer[];
  mergeStory: string[];
  approvedMemoryCount: number;
  draftMemoryCount: number;
} {
  const layers: MemoryPrecedenceLayer[] = [
    {
      layer: "policy",
      role: "Tier A/B workspace-kit run gates and JSON policyApproval",
      paths: [".ai/POLICY-APPROVAL.md", ".ai/machine-cli-policy.md"],
      winsOver: ["memory", "generated-docs"]
    },
    {
      layer: "machine-canon",
      role: "Agent execution facts and CLI contracts",
      paths: [".ai/AGENTS.md", ".ai/AGENT-CLI-MAP.md", "src/modules/*/instructions/*.md"],
      winsOver: ["memory", "generated-docs", "maintainer-prose"]
    },
    {
      layer: "maintainer-prose",
      role: "Human maintainer depth (not routine agent bootstrap)",
      paths: ["docs/maintainers/"],
      winsOver: ["memory"]
    },
    {
      layer: "generated-docs",
      role: "Documentation module outputs (document-project / generate-document)",
      paths: ["README.md (generated)", "docs/maintainers/ (generated sections)"],
      winsOver: ["memory"]
    },
    {
      layer: "memory",
      role: "Operational recall — approved project-memory records + optional CANNON.md",
      paths: [
        path.join(".workspace-kit", "memory", "records.json"),
        "CANNON.md"
      ],
      winsOver: []
    }
  ];

  const approved = listMemoryRecords(workspacePath, { status: "approved" });
  const draft = listMemoryRecords(workspacePath, { status: "draft" });
  const cannonPath = path.join(workspacePath, "CANNON.md");
  const hasCannon = fs.existsSync(cannonPath);

  const mergeStory = [
    "1. Sensitive mutations require JSON policyApproval on workspace-kit run (not chat).",
    "2. Machine canon under .ai/ and module instructions override memory for execution contracts.",
    "3. Maintainer docs/maintainers/ prose is human-first; agents use CLI JSON for queue facts.",
    "4. Generated README/docs sections from document-project are not edited by hand for module-owned bodies.",
    `5. Approved project-memory records (${approved.length}) supplement recall; draft records (${draft.length}) are advisory only.`,
    hasCannon
      ? "6. CANNON.md is a human-curated memory index; it does not override .ai/ policy or task-store authority."
      : "6. CANNON.md is optional; create at repo root for a stable human memory index."
  ];

  return {
    layers,
    mergeStory,
    approvedMemoryCount: approved.length,
    draftMemoryCount: draft.length
  };
}

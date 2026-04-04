#!/usr/bin/env node
/**
 * Ensures behavior-interview playbook HTML comment matches INTERVIEW_QUESTION_IDS_FINGERPRINT
 * and that fingerprint matches INTERVIEW_QUESTIONS ids in source (no dist required).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const interviewTs = readFileSync(path.join(root, "src/modules/agent-behavior/interview.ts"), "utf8");

const fpMatch = interviewTs.match(
  /export const INTERVIEW_QUESTION_IDS_FINGERPRINT =\s*"([^"]+)"/
);
if (!fpMatch) {
  console.error("check-behavior-interview-playbook-alignment: missing INTERVIEW_QUESTION_IDS_FINGERPRINT in interview.ts");
  process.exit(1);
}
const expected = fpMatch[1];

const iqIdx = interviewTs.indexOf("export const INTERVIEW_QUESTIONS");
if (iqIdx < 0) {
  console.error("check-behavior-interview-playbook-alignment: missing INTERVIEW_QUESTIONS");
  process.exit(1);
}
const slice = interviewTs.slice(iqIdx);
const end = slice.indexOf("\n];");
if (end < 0) {
  console.error("check-behavior-interview-playbook-alignment: malformed INTERVIEW_QUESTIONS array");
  process.exit(1);
}
const body = slice.slice(0, end);
const ids = [...body.matchAll(/\bid:\s*"([^"]+)"/g)].map((m) => m[1]);
const dynamic = ids.join(",");
if (dynamic !== expected) {
  console.error(
    `check-behavior-interview-playbook-alignment: INTERVIEW_QUESTIONS ids (${dynamic}) !== INTERVIEW_QUESTION_IDS_FINGERPRINT (${expected})`
  );
  process.exit(1);
}

const playbookPath = path.join(root, ".ai/playbooks/workspace-kit-chat-behavior-interview.md");
const playbook = readFileSync(playbookPath, "utf8");
const tag = `<!-- wc-behavior-interview-ids: ${expected} -->`;
if (!playbook.includes(tag)) {
  console.error(
    `check-behavior-interview-playbook-alignment: .ai playbook must contain exactly:\n${tag}`
  );
  process.exit(1);
}

console.error("check-behavior-interview-playbook-alignment: ok");

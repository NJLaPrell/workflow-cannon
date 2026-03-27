#!/usr/bin/env node
/**
 * Advisory-only: warn when .workspace-kit/tasks/state.json changes look like direct
 * task field edits without new transitionLog entries. Always exits 0.
 *
 * Env:
 *   ADVISORY_TASK_STATE_BASE — ref to diff against (default: origin/main)
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
const STATE_PATH = ".workspace-kit/tasks/state.json";
const baseRef = (process.env.ADVISORY_TASK_STATE_BASE || "origin/main").trim();

function sh(cmd, opts = {}) {
  try {
    return execSync(cmd, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024, ...opts }).trimEnd();
  } catch {
    return null;
  }
}

function parseState(raw, label) {
  try {
    return JSON.parse(raw);
  } catch (e) {
    console.warn(`[advisory-task-state] skip: ${label} is not valid JSON (${e})`);
    return null;
  }
}

function taskById(tasks) {
  const m = Object.create(null);
  if (!Array.isArray(tasks)) return m;
  for (const t of tasks) {
    if (t && typeof t.id === "string") m[t.id] = t;
  }
  return m;
}

function analyze(oldDoc, newDoc) {
  const warnings = [];
  const oldLogLen = Array.isArray(oldDoc.transitionLog) ? oldDoc.transitionLog.length : 0;
  const newLogLen = Array.isArray(newDoc.transitionLog) ? newDoc.transitionLog.length : 0;
  const ot = taskById(oldDoc.tasks);
  const nt = taskById(newDoc.tasks);

  for (const id of Object.keys(nt)) {
    const a = ot[id];
    const b = nt[id];
    if (!a || !b) continue;
    const statusChanged = a.status !== b.status;
    const timeChanged = a.updatedAt !== b.updatedAt;
    if ((statusChanged || timeChanged) && newLogLen <= oldLogLen) {
      warnings.push(
        `task "${id}": status or updatedAt changed but transitionLog did not grow (possible hand-edit); prefer workspace-kit run run-transition`
      );
    }
  }
  return warnings;
}

function main() {
  if (!existsSync(STATE_PATH)) {
    console.warn(`[advisory-task-state] skip: ${STATE_PATH} missing`);
    return;
  }
  const inGit = sh("git rev-parse --is-inside-work-tree");
  if (inGit !== "true") {
    console.warn("[advisory-task-state] skip: not a git repository");
    return;
  }

  const mergeBase = sh(`git merge-base HEAD ${baseRef}`) || sh("git rev-parse HEAD~1");
  if (!mergeBase) {
    console.warn("[advisory-task-state] skip: could not resolve base revision");
    return;
  }

  const nameOnly = sh(`git diff --name-only ${mergeBase}...HEAD`);
  if (!nameOnly || !nameOnly.split("\n").includes(STATE_PATH)) {
    return;
  }

  const oldRaw = sh(`git show ${mergeBase}:${STATE_PATH}`);
  if (oldRaw == null) {
    console.warn(`[advisory-task-state] skip: no ${STATE_PATH} at ${mergeBase}`);
    return;
  }
  const newRaw = readFileSync(STATE_PATH, "utf8");
  const oldDoc = parseState(oldRaw, "base state");
  const newDoc = parseState(newRaw, "working tree state");
  if (!oldDoc || !newDoc) return;

  for (const w of analyze(oldDoc, newDoc)) {
    console.warn(`[advisory-task-state] WARNING: ${w}`);
  }
}

main();

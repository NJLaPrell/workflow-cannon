# GPT Task Engine Command Registry Refactor Plan

## Purpose

Refactor the task-engine planning command dispatcher from a long command-name branch chain into a table-driven command registry with typed command definitions, shared invocation context, and incremental migration support.

This plan is intentionally implementation-oriented. It assumes the current dispatcher remains functional throughout the migration and that command movement
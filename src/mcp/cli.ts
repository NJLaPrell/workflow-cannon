#!/usr/bin/env node

import { runMcpStdioServer } from "./server.js";

runMcpStdioServer().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});

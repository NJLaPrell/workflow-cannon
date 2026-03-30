import * as esbuild from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extRoot = path.join(__dirname, "..");

await esbuild.build({
  entryPoints: [path.join(extRoot, "src/views/dashboard/dashboard-webview.ts")],
  bundle: true,
  platform: "browser",
  format: "iife",
  outfile: path.join(extRoot, "media/dashboard-webview.js"),
  target: "es2022",
  logLevel: "info"
});

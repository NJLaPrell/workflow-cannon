import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const extRoot = path.resolve(here, "..");
const src = path.join(extRoot, "node_modules", "mermaid", "dist", "mermaid.min.js");
const destDir = path.join(extRoot, "media");
const dest = path.join(destDir, "mermaid.min.js");

await mkdir(destDir, { recursive: true });
await copyFile(src, dest);

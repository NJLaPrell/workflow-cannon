/**
 * Interactive confirmation for `wk init` when no env approval / flags are provided.
 */
export async function promptTTYConfirmation(
  promptText: string,
  writeLine: (message: string) => void,
  readStdinLine?: () => Promise<string | null>
): Promise<boolean> {
  writeLine(promptText);
  let line: string | null | undefined;
  if (readStdinLine) {
    line = await readStdinLine();
  } else if (process.stdin.isTTY) {
    line = await new Promise<string | null>((resolve) => {
      process.stdin.setEncoding("utf8");
      process.stdin.once("data", (chunk: string | Buffer) => {
        resolve(String(chunk).trim());
      });
    });
  } else {
    return false;
  }
  if (!line) {
    return false;
  }
  const lower = line.trim().toLowerCase();
  return lower === "y" || lower === "yes";
}

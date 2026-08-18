import path from "node:path";
import { spawnSync } from "node:child_process";

export function die(message: string, code = 1): never {
  process.stderr.write(message.endsWith("\n") ? message : message + "\n");
  process.exit(code);
}

export function normalizeSlug(slug: string): string {
  return slug.replace(/\/+$/, "");
}

export function requireCmd(cmd: string): void {
  const res = spawnSync(cmd, ["--version"], { stdio: "ignore" });
  if (res.error || res.status !== 0) {
    die(`Missing required command: ${cmd}`);
  }
}

// Build the (command, argv) pair for re-invoking gwoc as a subprocess.
// Handles three cases:
//   - dev (bun ./gwoc.ts): execPath is `bun`, argv[1] is the .ts entry script
//   - npm/npx (node --import tsx): execPath is `node`, argv[1] is the script
//   - compiled binary (bun build --compile): execPath is the binary itself
//     and argv[1] is the first user arg (no separate script path)
export function selfInvokeArgv(args: string[]): { command: string; argv: string[] } {
  const exec = process.execPath;
  const base = path.basename(exec).replace(/\.exe$/i, "").toLowerCase();
  const isInterpreter =
    base === "bun" || base === "bun-debug" || base === "node" || base.startsWith("tsx");
  if (isInterpreter && process.argv[1]) {
    return { command: exec, argv: [process.argv[1], ...args] };
  }
  return { command: exec, argv: args };
}

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

export type HookName = "post-init" | "post-clone" | "post-create";

export interface RunHooksOptions {
  worktree?: string;
  hubRoot?: string;
  skip?: boolean;
}

type Level = "user" | "hub" | "worktree";

function userConfigDir(): string {
  return process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
}

function candidates(name: HookName, opts: RunHooksOptions): Array<{ level: Level; path: string }> {
  const out: Array<{ level: Level; path: string }> = [];
  out.push({ level: "user", path: path.join(userConfigDir(), "gwoc", "hooks", name) });
  if (opts.hubRoot) {
    out.push({ level: "hub", path: path.join(opts.hubRoot, ".gwoc", "hooks", name) });
  }
  if (opts.worktree) {
    out.push({ level: "worktree", path: path.join(opts.worktree, ".gwoc", "hooks", name) });
  }
  return out;
}

export function runHooks(
  name: HookName,
  env: Record<string, string>,
  opts: RunHooksOptions,
): void {
  if (opts.skip) {
    return;
  }
  const cwd = opts.worktree ?? opts.hubRoot ?? process.cwd();
  const hookEnv = { ...process.env, ...env };

  for (const { level, path: hookPath } of candidates(name, opts)) {
    if (!fs.existsSync(hookPath)) {
      continue;
    }
    process.stdout.write(`Running ${name} hook (${level})...\n`);
    let res = spawnSync(hookPath, [], { cwd, stdio: "inherit", env: hookEnv });
    if (res.error && (res.error as NodeJS.ErrnoException).code === "ENOEXEC") {
      res = spawnSync("bash", [hookPath], { cwd, stdio: "inherit", env: hookEnv });
    }
    if (res.error) {
      process.stderr.write(`Warning: ${name} hook (${level}) failed to run: ${res.error}\n`);
    } else if (res.status !== 0) {
      process.stderr.write(`Warning: ${name} hook (${level}) exited with status ${res.status}\n`);
    }
  }
}

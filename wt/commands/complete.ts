import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const COMMANDS = [
  "init",
  "clone",
  "new",
  "checkout",
  "co",
  "list",
  "ls",
  "rm",
  "remove",
  "rename",
  "mv",
  "status",
  "merge",
  "push",
  "pull",
  "rebase",
  "fetch",
  "prune",
  "doctor",
  "check",
  "manage",
  "ui",
  "sync",
  "root",
  "dir",
  "primary",
  "path",
  "default",
  "completion",
  "help",
];

// Subcommands whose first positional is an existing worktree slug.
const SLUG_FIRST = new Set([
  "rm",
  "remove",
  "rename",
  "mv",
  "status",
  "merge",
  "push",
  "pull",
  "rebase",
  "path",
]);

const SHELLS = ["bash", "zsh", "fish"];

export function wtComplete(args: string[]): void {
  // Completion shells may close the pipe early (e.g. user aborts). Swallow
  // EPIPE so we don't dump a stack trace into the shell.
  process.stdout.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EPIPE") process.exit(0);
  });

  const cword = Number.parseInt(args[0] ?? "0", 10);
  const words = args.slice(1);
  const current = words[cword] ?? "";

  // words[0] is the program name ("gwoc"); cword === 1 is the subcommand.
  if (cword === 1) {
    emitMatches(COMMANDS, current);
    return;
  }

  if (cword === 2) {
    const sub = words[1] ?? "";
    if (SLUG_FIRST.has(sub)) {
      emitSlugs(current);
      return;
    }
    if (sub === "completion") {
      emitMatches(SHELLS, current);
      return;
    }
  }

  // Default: no candidates (shell falls back to filename completion).
}

function emitMatches(candidates: string[], prefix: string): void {
  for (const c of candidates) {
    if (c.startsWith(prefix)) {
      process.stdout.write(c + "\n");
    }
  }
}

// Find the bare repo quietly (no die on missing hub). Returns null if we're
// not obviously in a hub root.
function findBareRepoQuiet(): string | null {
  const override = process.env.GWOC_GIT_DIR;
  if (override) {
    return path.resolve(override);
  }
  let cwd: string;
  try {
    cwd = process.cwd();
  } catch {
    return null;
  }
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(cwd, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.endsWith(".git")) continue;
    const candidate = path.join(cwd, entry.name);
    const out = spawnSync(
      "git",
      ["--git-dir", candidate, "rev-parse", "--is-bare-repository"],
      { encoding: "utf8" },
    );
    if ((out.stdout || "").trim() === "true") {
      return candidate;
    }
  }
  return null;
}

function emitSlugs(prefix: string): void {
  const bare = findBareRepoQuiet();
  if (!bare) return; // not in a hub — silent

  const res = spawnSync("git", ["--git-dir", bare, "worktree", "list", "--porcelain"], {
    encoding: "utf8",
  });
  if (res.status !== 0) return;

  const out = res.stdout || "";
  for (const line of out.split(/\r?\n/)) {
    if (!line.startsWith("worktree ")) continue;
    const p = line.slice("worktree ".length).trim();
    if (!p || !fs.existsSync(p)) continue;
    const slug = path.basename(p);
    if (slug.startsWith(prefix)) {
      process.stdout.write(slug + "\n");
    }
  }
}

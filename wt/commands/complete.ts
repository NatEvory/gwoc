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

// Find the bare repo quietly (no die on missing hub). Mirrors the resolution
// in git.ts: hub root scan, then worktree common-dir, then ancestor walk.
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

  const isBare = (gitdir: string): boolean => {
    const out = spawnSync(
      "git",
      ["--git-dir", gitdir, "rev-parse", "--is-bare-repository"],
      { encoding: "utf8" },
    );
    return out.status === 0 && (out.stdout || "").trim() === "true";
  };
  const scan = (dir: string): string | null => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return null;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.endsWith(".git")) continue;
      const candidate = path.join(dir, entry.name);
      if (isBare(candidate)) return candidate;
    }
    return null;
  };

  const local = scan(cwd);
  if (local) return local;

  // Inside a worktree, the hub's bare repo is the common git dir.
  const res = spawnSync("git", ["rev-parse", "--git-common-dir"], {
    cwd,
    encoding: "utf8",
  });
  if (res.status === 0) {
    const common = path.resolve(cwd, (res.stdout || "").trim());
    if (isBare(common)) return common;
  }

  let dir = path.dirname(cwd);
  while (true) {
    const found = scan(dir);
    if (found) return found;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
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
    // Slug is the path relative to the hub root (parent of the bare repo) —
    // basename would be wrong for nested slugs like user/pr-123.
    const slug = path.relative(path.dirname(bare), p);
    if (slug.startsWith(prefix)) {
      process.stdout.write(slug + "\n");
    }
  }
}

import fs from "node:fs";
import path from "node:path";

import { die } from "../common.ts";
import { branchToSlug, gitDir, gitExitCode, gitOutput, worktreePath } from "../git.ts";

/**
 * Resolve a user-supplied slug or branch name to a worktree path.
 * Tries the literal directory name, then the branch name flattened through
 * the slug separator, then any worktree with that branch checked out.
 * Falls back to the mapped path (for "not found" messages and `gwoc path`,
 * where the mapped location is where the worktree would live).
 */
export function resolveWorktreePath(arg: string): string {
  const literal = worktreePath(arg);
  if (fs.existsSync(literal)) {
    return literal;
  }
  const mapped = worktreePath(branchToSlug(arg));
  if (mapped !== literal && fs.existsSync(mapped)) {
    return mapped;
  }
  const byBranch = worktreeForBranch(arg);
  if (byBranch) {
    return byBranch;
  }
  return mapped;
}

/**
 * Resolve a user-supplied slug or branch name to a branch name.
 * Prefers an existing branch of that exact name; otherwise the branch
 * checked out in the worktree directory of that name.
 */
export function resolveBranchArg(arg: string): string {
  if (gitExitCode(["--git-dir", gitDir(), "show-ref", "--verify", "--quiet", `refs/heads/${arg}`]) === 0) {
    return arg;
  }
  const dir = worktreePath(arg);
  if (fs.existsSync(dir)) {
    return currentBranch(dir);
  }
  die(`Branch not found: ${arg}`);
}

// Resolve the hub root for init/clone. By default the hub root is
// <parent>/<name>; --flat keeps the pre-0.15 layout where the bare repo and
// worktrees land directly in <parent>. An existing empty directory is reused
// (so `mkdir my-repo` before init/clone still works); anything else refuses
// rather than mixing a hub into existing content.
export function resolveHubRoot(parent: string, name: string, flat: boolean): string {
  if (flat) {
    return parent;
  }
  const root = path.join(parent, name);
  if (fs.existsSync(root)) {
    if (!fs.statSync(root).isDirectory() || fs.readdirSync(root).length > 0) {
      die(`Target already exists and is not an empty directory: ${root}`);
    }
  }
  return root;
}

// Refuse operations that would remove or move the directory the user is
// standing in — the shell would be left in a dead path.
export function ensureCwdOutside(worktree: string, action: string): void {
  let cwd: string;
  let target: string;
  try {
    cwd = fs.realpathSync(process.cwd());
    target = fs.realpathSync(worktree);
  } catch {
    return;
  }
  if (cwd === target || cwd.startsWith(target + path.sep)) {
    die(
      `Refusing to ${action} the worktree containing the current directory: ${worktree}\ncd out of it first (e.g. cd "$(gwoc root)").`
    );
  }
}

export function currentBranch(worktree: string): string {
  const name = gitOutput(["-C", worktree, "rev-parse", "--abbrev-ref", "HEAD"]);
  if (!name || name === "HEAD") {
    die(`Worktree is in detached HEAD: ${worktree}`);
  }
  return name;
}

// Like currentBranch but returns null on detached HEAD instead of dying.
// Use in read-only contexts (status, doctor) that should tolerate detached state.
export function tryCurrentBranch(worktree: string): string | null {
  const res = gitExitCode(["-C", worktree, "symbolic-ref", "-q", "HEAD"]);
  if (res !== 0) {
    return null;
  }
  const name = gitOutput(["-C", worktree, "rev-parse", "--abbrev-ref", "HEAD"]);
  if (!name || name === "HEAD") {
    return null;
  }
  return name;
}

export function ensureClean(worktree: string): void {
  const out = gitOutput(["-C", worktree, "status", "--porcelain"]);
  if (out) {
    die(`Worktree has uncommitted changes: ${worktree}`);
  }
}

export function ensureBranchExists(branch: string): void {
  if (gitExitCode(["--git-dir", gitDir(), "show-ref", "--verify", "--quiet", `refs/heads/${branch}`]) !== 0) {
    die(`Branch not found: ${branch}`);
  }
}

export function worktreeForBranch(branch: string): string | null {
  const out = gitOutput(["--git-dir", gitDir(), "worktree", "list", "--porcelain"]);
  const lines = out.split(/\r?\n/);
  let current = "";
  for (const line of lines) {
    if (!line.trim()) {
      current = "";
      continue;
    }
    if (line.startsWith("worktree ")) {
      current = line.slice("worktree ".length).trim();
      continue;
    }
    if (line.startsWith("branch ") && line.slice("branch ".length).trim() === `refs/heads/${branch}`) {
      return current || null;
    }
  }
  return null;
}

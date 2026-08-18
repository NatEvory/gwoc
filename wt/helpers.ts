import fs from "node:fs";
import path from "node:path";

import { die } from "../common.ts";
import { gitDir, gitExitCode, gitOutput } from "../git.ts";

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

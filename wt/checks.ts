import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { branchToSlug, defaultBranch, gitDir, gitOutput, hubRoot, primaryWorktree } from "../git.ts";
import { tryCurrentBranch } from "./helpers.ts";

export interface Issue {
  level: "warn" | "error";
  code: string;
  message: string;
}

// ---------- per-worktree checks ----------

function upstreamStatus(worktree: string): "ok" | "gone" | "none" {
  // Resolve the current branch via symbolic-ref so detached HEAD short-circuits.
  const branchRes = spawnSync("git", ["-C", worktree, "symbolic-ref", "-q", "--short", "HEAD"], { encoding: "utf8" });
  if (branchRes.status !== 0) {
    return "none";
  }
  const branch = (branchRes.stdout || "").trim();
  if (!branch) {
    return "none";
  }
  // `upstream:track` is empty if no upstream, "[gone]" if the upstream ref is gone,
  // and something like "[ahead 2]" otherwise.
  const trackRes = spawnSync(
    "git",
    ["-C", worktree, "for-each-ref", "--format=%(upstream:track)", `refs/heads/${branch}`],
    { encoding: "utf8" },
  );
  if (trackRes.status !== 0) {
    return "none";
  }
  const track = (trackRes.stdout || "").trim();
  if (!track) {
    // Could be "no upstream set" or "upstream set, in sync". Distinguish by checking upstream ref.
    const upRes = spawnSync(
      "git",
      ["-C", worktree, "rev-parse", "--abbrev-ref", `${branch}@{upstream}`],
      { encoding: "utf8" },
    );
    return upRes.status === 0 ? "ok" : "none";
  }
  if (track === "[gone]") {
    return "gone";
  }
  return "ok";
}

export function worktreeIssues(worktreePathAbs: string): Issue[] {
  const issues: Issue[] = [];
  const branch = tryCurrentBranch(worktreePathAbs);

  if (branch === null) {
    issues.push({
      level: "warn",
      code: "detached-head",
      message: "Detached HEAD (no branch checked out)",
    });
    // No branch → skip mismatch and upstream checks.
    return issues;
  }

  // Slug/branch mismatch — only meaningful for non-primary worktrees.
  // The primary worktree's directory name is the user-chosen "primary" slug and
  // bears no required relationship to the branch (common: dir "main", branch "main",
  // but also legit: dir "dev", branch "main").
  // The slug is the path of the worktree relative to the hub root, so
  // branches with slashes (e.g. "user/pr-123") nest into "user/pr-123" and
  // still match.
  const slug = path.relative(hubRoot(), worktreePathAbs);
  let isPrimary = false;
  try {
    isPrimary = path.resolve(worktreePathAbs) === path.resolve(primaryWorktree());
  } catch {
    isPrimary = false;
  }
  // Compare against the branch mapped through the slug separator, so a
  // flattened directory (feature_x for branch feature/x) is not a mismatch.
  if (!isPrimary && slug !== branchToSlug(branch)) {
    issues.push({
      level: "warn",
      code: "slug-branch-mismatch",
      message: `Directory is '${slug}' but branch is '${branch}' — run 'gwoc rename ${slug} ${branch}' or rename the branch`,
    });
  }

  // Upstream gone.
  if (upstreamStatus(worktreePathAbs) === "gone") {
    issues.push({
      level: "warn",
      code: "upstream-gone",
      message: `Upstream for '${branch}' has been deleted on the remote (branch is [gone])`,
    });
  }

  return issues;
}

// ---------- hub-wide checks ----------

export interface WorktreeEntry {
  path: string;
  branch: string | null; // null if detached/bare
  prunable: string | null; // reason string if prunable, else null
  isBare: boolean;
}

export function parseWorktreeList(): WorktreeEntry[] {
  const out = gitOutput(["--git-dir", gitDir(), "worktree", "list", "--porcelain"]);
  const entries: WorktreeEntry[] = [];
  let current: Partial<WorktreeEntry> | null = null;

  const flush = () => {
    if (current && current.path) {
      entries.push({
        path: current.path,
        branch: current.branch ?? null,
        prunable: current.prunable ?? null,
        isBare: current.isBare ?? false,
      });
    }
    current = null;
  };

  for (const line of out.split(/\r?\n/)) {
    if (!line.trim()) {
      flush();
      continue;
    }
    if (line.startsWith("worktree ")) {
      flush();
      current = { path: line.slice("worktree ".length).trim() };
    } else if (!current) {
      continue;
    } else if (line === "bare") {
      current.isBare = true;
    } else if (line.startsWith("branch ")) {
      current.branch = line.slice("branch ".length).trim().replace(/^refs\/heads\//, "");
    } else if (line === "detached") {
      current.branch = null;
    } else if (line === "prunable" || line.startsWith("prunable ")) {
      current.prunable = line.length > "prunable".length ? line.slice("prunable ".length).trim() : "stale";
    }
  }
  flush();
  return entries;
}

export function orphanedBranches(): { unmerged: string[]; merged: string[] } {
  const bare = gitDir();

  // All local branches — one spawn.
  const allBranches = new Set(
    gitOutput(["--git-dir", bare, "for-each-ref", "--format=%(refname:short)", "refs/heads/"])
      .split(/\r?\n/)
      .filter(Boolean),
  );

  // Branches whose tips are reachable from the default branch — one spawn.
  const def = defaultBranch();
  const mergedSet = new Set(
    gitOutput(["--git-dir", bare, "for-each-ref", "--merged", def, "--format=%(refname:short)", "refs/heads/"])
      .split(/\r?\n/)
      .filter(Boolean),
  );

  // Branches currently checked out in a worktree.
  const entries = parseWorktreeList();
  const checkedOut = new Set<string>();
  for (const e of entries) {
    if (e.branch) checkedOut.add(e.branch);
  }

  const unmerged: string[] = [];
  const merged: string[] = [];
  for (const b of allBranches) {
    if (b === def) continue;
    if (checkedOut.has(b)) continue;
    if (mergedSet.has(b)) {
      merged.push(b);
    } else {
      unmerged.push(b);
    }
  }
  return { unmerged, merged };
}

export function prunableEntries(): Array<{ path: string; reason: string }> {
  return parseWorktreeList()
    .filter((e) => e.prunable !== null)
    .map((e) => ({ path: e.path, reason: e.prunable as string }));
}

export function missingPrimary(): string | null {
  try {
    const p = primaryWorktree();
    return fs.existsSync(p) ? null : p;
  } catch {
    return null;
  }
}

// Returns all non-bare worktree paths that exist on disk (for iteration by doctor/status).
export function liveWorktreePaths(): string[] {
  return parseWorktreeList()
    .filter((e) => !e.isBare && e.prunable === null && fs.existsSync(e.path))
    .map((e) => e.path);
}

export function hubRootSafe(): string {
  return hubRoot();
}

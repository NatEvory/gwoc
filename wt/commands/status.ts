import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { parseArgs } from "node:util";

import { die, normalizeSlug } from "../../common.ts";
import { gitDir, gitOutput } from "../../git.ts";
import { resolveWorktreePath, tryCurrentBranch } from "../helpers.ts";
import { worktreeIssues } from "../checks.ts";

function usage(): void {
  process.stdout.write(`Usage: gwoc status [slug]

Show status of a worktree, or all worktrees if no slug is given.

Options:
  -h, --help         Show help
`);
}

export function aheadBehind(worktree: string): string {
  const res = spawnSync(
    "git",
    ["-C", worktree, "rev-list", "--left-right", "--count", "HEAD...@{u}"],
    { encoding: "utf8" }
  );
  if (res.status !== 0) {
    return "no upstream";
  }
  const parts = (res.stdout || "").trim().split(/\s+/);
  const ahead = Number.parseInt(parts[0] || "0", 10);
  const behind = Number.parseInt(parts[1] || "0", 10);
  if (ahead === 0 && behind === 0) {
    return "up to date";
  }
  const segments: string[] = [];
  if (ahead > 0) segments.push(`ahead ${ahead}`);
  if (behind > 0) segments.push(`behind ${behind}`);
  return segments.join(", ");
}

export function fileStatus(worktree: string): string {
  const out = gitOutput(["-C", worktree, "status", "--porcelain"]);
  if (!out) {
    return "clean";
  }
  const lines = out.split(/\r?\n/).filter(Boolean);
  let modified = 0;
  let untracked = 0;
  let staged = 0;
  for (const line of lines) {
    const x = line[0];
    const y = line[1];
    if (x === "?" && y === "?") {
      untracked++;
    } else {
      if (x !== " " && x !== "?") staged++;
      if (y !== " " && y !== "?") modified++;
    }
  }
  const parts: string[] = [];
  if (staged > 0) parts.push(`${staged} staged`);
  if (modified > 0) parts.push(`${modified} modified`);
  if (untracked > 0) parts.push(`${untracked} untracked`);
  return parts.join(", ");
}

function lastCommit(worktree: string): string {
  return gitOutput(["-C", worktree, "log", "-1", "--format=%h %s (%cr)"]);
}

function printStatus(target: string): void {
  const branch = tryCurrentBranch(target);
  const branchLabel = branch ?? "(detached HEAD)";
  const status = fileStatus(target);
  const remote = aheadBehind(target);
  const commit = lastCommit(target);

  process.stdout.write(`Worktree:     ${target}\n`);
  process.stdout.write(`Branch:       ${branchLabel}\n`);
  process.stdout.write(`Status:       ${status}\n`);
  process.stdout.write(`Remote:       ${remote}\n`);
  process.stdout.write(`Last commit:  ${commit}\n`);

  const issues = worktreeIssues(target);
  for (const issue of issues) {
    process.stdout.write(`Warning:      ${issue.message}\n`);
  }
}

function allWorktreePaths(): string[] {
  const out = gitOutput(["--git-dir", gitDir(), "worktree", "list", "--porcelain"]);
  const paths: string[] = [];
  let current = "";
  let isBare = false;
  for (const line of out.split(/\r?\n/)) {
    if (line.startsWith("worktree ")) {
      current = line.slice("worktree ".length).trim();
      isBare = false;
    } else if (line === "bare") {
      isBare = true;
    } else if (!line.trim()) {
      if (current && !isBare) {
        paths.push(current);
      }
      current = "";
    }
  }
  if (current && !isBare) {
    paths.push(current);
  }
  return paths;
}

export function wtStatus(args: string[]): void {
  if (args.includes("-h") || args.includes("--help")) {
    usage();
    return;
  }

  const { positionals } = parseArgs({
    args,
    options: {},
    allowPositionals: true,
  });

  const slug = normalizeSlug(positionals[0] || "");

  if (slug) {
    const target = resolveWorktreePath(slug);
    if (!fs.existsSync(target)) {
      die(`Worktree not found: ${target}`);
    }
    printStatus(target);
    return;
  }

  const paths = allWorktreePaths();
  for (let i = 0; i < paths.length; i++) {
    if (i > 0) process.stdout.write("\n");
    printStatus(paths[i]);
  }
}

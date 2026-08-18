import fs from "node:fs";
import { parseArgs } from "node:util";

import { die, normalizeSlug } from "../../common.ts";
import { gitInherit, primaryWorktree } from "../../git.ts";
import { currentBranch, ensureBranchExists, ensureClean, worktreeForBranch } from "../helpers.ts";

function usage(): void {
  process.stdout.write(`Usage: gwoc merge <slug> [--into <branch>]

Merge a worktree branch into the target branch in the primary worktree.

Options:
  --into <branch>    Target branch in the primary worktree (default: current)
  -h, --help         Show help

Warning: Refuses to merge if the primary worktree is dirty.
`);
}

export function wtMerge(args: string[]): void {
  if (args.includes("-h") || args.includes("--help")) {
    usage();
    return;
  }

  const { values, positionals } = parseArgs({
    args,
    options: {
      into: { type: "string", default: "" },
    },
    allowPositionals: true,
  });

  const slug = normalizeSlug(positionals[0] || "");
  if (!slug) {
    die("Missing slug");
  }

  const into = values.into as string;
  const sourceBranch = slug;
  ensureBranchExists(sourceBranch);

  const primary = primaryWorktree();
  if (!fs.existsSync(primary)) {
    die(`Primary worktree not found: ${primary}`);
  }

  let target = primary;
  let targetBranch = "";
  let needsCheckout = false;

  if (into) {
    targetBranch = into;
    ensureBranchExists(targetBranch);
    const branchWorktree = worktreeForBranch(targetBranch);
    if (branchWorktree) {
      target = branchWorktree;
    } else {
      target = primary;
      needsCheckout = currentBranch(target) !== targetBranch;
    }
  } else {
    targetBranch = currentBranch(target);
  }

  if (!fs.existsSync(target)) {
    die(`Target worktree not found: ${target}`);
  }
  ensureClean(target);

  if (needsCheckout) {
    gitInherit(["-C", target, "checkout", targetBranch]);
  }

  gitInherit(["-C", target, "merge", sourceBranch]);
}

import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { parseArgs } from "node:util";

import { die, normalizeSlug } from "../../common.ts";
import { branchToSlug, gitDir, gitExitCode, runGit, worktreePath } from "../../git.ts";
import { currentBranch, ensureClean, ensureCwdOutside, resolveWorktreePath } from "../helpers.ts";

function usage(): void {
  process.stdout.write(`Usage: gwoc rename <old-slug> <new-slug> [--force]

Rename a worktree directory and its checked-out branch in one step.

This runs \`git worktree move\` to rename the directory (keeping git's
worktree admin metadata consistent) and \`git branch -m\` to rename the
branch to match the new slug. Refuses on detached HEAD.

Options:
  --force            Allow rename with uncommitted changes in the worktree
  -h, --help         Show help

Notes:
  If the branch has an upstream, the upstream ref is NOT renamed. After
  rename you will need:
    gwoc push <new-slug> --set-upstream
  and, if you'd already pushed the old branch:
    git -C <new-slug> push origin --delete <old-branch>
`);
}

export function wtRename(args: string[]): void {
  if (args.includes("-h") || args.includes("--help")) {
    usage();
    return;
  }

  const { values, positionals } = parseArgs({
    args,
    options: {
      force: { type: "boolean", default: false },
    },
    allowPositionals: true,
  });

  const oldSlug = normalizeSlug(positionals[0] || "");
  const newSlug = normalizeSlug(positionals[1] || "");
  if (!oldSlug || !newSlug) {
    die("Usage: gwoc rename <old-slug> <new-slug>");
  }
  if (oldSlug === newSlug) {
    die("Old and new slugs are the same");
  }

  const oldPath = resolveWorktreePath(oldSlug);
  // <new> names the branch; the directory name is mapped through the slug
  // separator (identical unless one is configured).
  const newPath = worktreePath(branchToSlug(newSlug));

  if (!fs.existsSync(oldPath)) {
    die(`Worktree not found: ${oldPath}`);
  }
  ensureCwdOutside(oldPath, "rename");
  if (fs.existsSync(newPath)) {
    die(`Target path already exists: ${newPath}`);
  }

  // Resolve the current branch up front — also enforces "no detached HEAD".
  const oldBranch = currentBranch(oldPath);

  // Refuse if the target branch name is already taken by another ref.
  if (
    oldBranch !== newSlug &&
    gitExitCode(["--git-dir", gitDir(), "show-ref", "--verify", "--quiet", `refs/heads/${newSlug}`]) === 0
  ) {
    die(`Branch already exists: ${newSlug}`);
  }

  if (!(values.force as boolean)) {
    ensureClean(oldPath);
  }

  // 1. Move the worktree directory (git updates its admin metadata).
  runGit(["--git-dir", gitDir(), "worktree", "move", oldPath, newPath]);

  // 2. Rename the checked-out branch, if it doesn't already match.
  if (oldBranch !== newSlug) {
    runGit(["-C", newPath, "branch", "-m", newSlug]);
  }

  process.stdout.write(`Renamed: ${oldPath} -> ${newPath}\n`);
  if (oldBranch !== newSlug) {
    process.stdout.write(`Branch:  ${oldBranch} -> ${newSlug}\n`);
  }

  // If the (now renamed) branch has an upstream, warn about stale tracking.
  const upstreamRes = spawnSync(
    "git",
    ["-C", newPath, "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"],
    { encoding: "utf8" },
  );
  if (upstreamRes.status === 0) {
    const upstream = (upstreamRes.stdout || "").trim();
    if (upstream) {
      process.stdout.write(
        `Note: upstream is still ${upstream}. Run \`gwoc push ${newSlug} --set-upstream\` to retarget.\n`,
      );
    }
  }
}

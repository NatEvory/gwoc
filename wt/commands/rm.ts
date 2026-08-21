import fs from "node:fs";
import { parseArgs } from "node:util";

import { die, normalizeSlug } from "../../common.ts";
import { gitDir, gitOutput, runGit, worktreePath } from "../../git.ts";
import { ensureCwdOutside } from "../helpers.ts";

function usage(): void {
  process.stdout.write(`Usage: gwoc rm <slug> [--prune] [--force]

Remove a worktree directory safely.

Warning: Refuses to remove worktrees with uncommitted changes.

Options:
  --prune            Also delete the branch after removing the worktree
  --force            Remove even with uncommitted changes; with --prune, force-delete the branch
  -h, --help         Show help
`);
}

export function wtRemove(args: string[]): void {
  if (args.includes("-h") || args.includes("--help")) {
    usage();
    return;
  }

  const { values, positionals } = parseArgs({
    args,
    options: {
      prune: { type: "boolean", default: false },
      force: { type: "boolean", default: false },
    },
    allowPositionals: true,
  });

  const slug = normalizeSlug(positionals[0] || "");
  if (!slug) {
    die("Missing slug");
  }

  const force = values.force as boolean;
  const prune = values.prune as boolean;
  const target = worktreePath(slug);
  if (!fs.existsSync(target)) {
    die(`Worktree not found: ${target}`);
  }
  ensureCwdOutside(target, "remove");
  if (!force) {
    const dirty = gitOutput(["-C", target, "status", "--porcelain"]);
    if (dirty) {
      die(`Worktree has uncommitted changes: ${target}`);
    }
  }
  const removeArgs = ["--git-dir", gitDir(), "worktree", "remove"];
  if (force) {
    removeArgs.push("--force");
  }
  removeArgs.push(target);
  runGit(removeArgs);
  process.stdout.write(`Removed: ${target}\n`);

  if (prune) {
    const deleteFlag = force ? "-D" : "-d";
    runGit(["--git-dir", gitDir(), "branch", deleteFlag, slug]);
    process.stdout.write(`Deleted branch: ${slug}\n`);
  }
}

import fs from "node:fs";
import { parseArgs } from "node:util";

import { die, normalizeSlug } from "../../common.ts";
import { branchToSlug, defaultBranch, gitDir, hubRoot, requireGitRelativePaths, runGit, worktreePath } from "../../git.ts";
import { runHooks } from "../hooks.ts";

function usage(): void {
  process.stdout.write(`Usage: gwoc new <slug> [--branch <name>] [--no-hooks]

Create a new worktree and branch for a task.

Options:
  --branch <name>    Base branch for the new worktree (default: repo default)
  --no-hooks         Skip post-create hooks
  -h, --help         Show help

Hooks:
  post-create hooks run after the worktree is created, with cwd set to the
  worktree. All matching hooks run in order (user \u2192 hub \u2192 worktree):
    1. $XDG_CONFIG_HOME/gwoc/hooks/post-create  (or ~/.config/gwoc/hooks/post-create)
    2. <hub-root>/.gwoc/hooks/post-create
    3. <worktree>/.gwoc/hooks/post-create
  Env: GWOC_SLUG, GWOC_BRANCH, GWOC_BASE_BRANCH, GWOC_WORKTREE, GWOC_HUB_ROOT
`);
}

export function wtNew(args: string[]): void {
  if (args.includes("-h") || args.includes("--help")) {
    usage();
    return;
  }
  requireGitRelativePaths();

  const { values, positionals } = parseArgs({
    args,
    options: {
      branch: { type: "string", default: "" },
      "no-hooks": { type: "boolean", default: false },
    },
    allowPositionals: true,
  });

  const input = normalizeSlug(positionals[0] || "");
  if (!input) {
    die("Missing slug");
  }

  const baseBranch = (values.branch as string) || defaultBranch();
  const branch = input;
  const slug = branchToSlug(branch);
  const target = worktreePath(slug);
  if (fs.existsSync(target)) {
    die(`Worktree path already exists: ${target}`);
  }
  runGit([
    "--git-dir",
    gitDir(),
    "worktree",
    "add",
    "--relative-paths",
    "-b",
    branch,
    target,
    baseBranch,
  ]);
  process.stdout.write(`Worktree: ${target}\n`);
  process.stdout.write(`Branch: ${branch}\n`);

  const root = hubRoot();
  runHooks(
    "post-create",
    {
      GWOC_SLUG: slug,
      GWOC_BRANCH: branch,
      GWOC_BASE_BRANCH: baseBranch,
      GWOC_WORKTREE: target,
      GWOC_HUB_ROOT: root,
    },
    { worktree: target, hubRoot: root, skip: values["no-hooks"] as boolean },
  );
}

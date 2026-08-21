import fs from "node:fs";
import { parseArgs } from "node:util";

import { die, normalizeSlug } from "../../common.ts";
import { defaultBranch, gitDir, gitInherit, gitOutput, runGit } from "../../git.ts";
import { currentBranch, ensureClean, resolveWorktreePath } from "../helpers.ts";

function usage(): void {
  process.stdout.write(`Usage: gwoc rebase <slug> [--onto <branch>] [--no-fetch]

Rebase a worktree branch onto the latest target branch.

Options:
  --onto <branch>    Branch to rebase onto (default: default branch)
  --no-fetch         Skip fetching before rebase
  -h, --help         Show help

Fetches the latest refs before rebasing (unless --no-fetch).
Refuses to rebase if the worktree has uncommitted changes.
`);
}

export function wtRebase(args: string[]): void {
  if (args.includes("-h") || args.includes("--help")) {
    usage();
    return;
  }

  const { values, positionals } = parseArgs({
    args,
    options: {
      onto: { type: "string", default: "" },
      "no-fetch": { type: "boolean", default: false },
    },
    allowPositionals: true,
  });

  const slug = normalizeSlug(positionals[0] || "");
  if (!slug) {
    die("Missing slug");
  }

  const wt = resolveWorktreePath(slug);
  if (!fs.existsSync(wt)) {
    die(`Worktree not found: ${wt}`);
  }

  ensureClean(wt);

  const onto = (values.onto as string) || defaultBranch();
  const branch = currentBranch(wt);

  if (branch === onto) {
    die(`Worktree branch "${branch}" is the same as the rebase target`);
  }

  if (!values["no-fetch"]) {
    const remotes = gitOutput(["--git-dir", gitDir(), "remote"]);
    if (remotes) {
      runGit(["--git-dir", gitDir(), "fetch", "origin"]);
    }
  }

  gitInherit(["-C", wt, "rebase", onto]);
}

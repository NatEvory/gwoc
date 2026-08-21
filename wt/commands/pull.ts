import fs from "node:fs";
import { parseArgs } from "node:util";

import { die, normalizeSlug } from "../../common.ts";
import { gitInherit } from "../../git.ts";
import { currentBranch, resolveWorktreePath } from "../helpers.ts";

function usage(): void {
  process.stdout.write(`Usage: gwoc pull <slug> [--remote <name>] [--branch <name>]

Pull a remote branch into a worktree.

Options:
  --remote <name>       Remote name (default: origin)
  --branch <name>       Branch to pull (default: current branch in worktree)
  -h, --help            Show help
`);
}

export function wtPull(args: string[]): void {
  if (args.includes("-h") || args.includes("--help")) {
    usage();
    return;
  }

  const { values, positionals } = parseArgs({
    args,
    options: {
      remote: { type: "string", default: "origin" },
      branch: { type: "string", default: "" },
    },
    allowPositionals: true,
  });

  const slug = normalizeSlug(positionals[0] || "");
  if (!slug) {
    die("Missing slug");
  }

  const target = resolveWorktreePath(slug);
  if (!fs.existsSync(target)) {
    die(`Worktree not found: ${target}`);
  }

  const branchName = (values.branch as string) || currentBranch(target);
  gitInherit(["-C", target, "pull", values.remote as string, branchName]);
}

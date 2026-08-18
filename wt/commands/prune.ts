import { gitDir, runGit } from "../../git.ts";

function usage(): void {
  process.stdout.write(`Usage: gwoc prune

Prune stale worktree references from the bare repo.

Options:
  -h, --help         Show help
`);
}

export function wtPrune(args: string[]): void {
  if (args.includes("-h") || args.includes("--help")) {
    usage();
    return;
  }
  runGit(["--git-dir", gitDir(), "worktree", "prune"]);
}

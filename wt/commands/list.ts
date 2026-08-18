import { gitDir, gitInherit } from "../../git.ts";

function usage(): void {
  process.stdout.write(`Usage: gwoc list

List worktrees in the hub.

Options:
  -h, --help         Show help
`);
}

export function wtList(args: string[]): void {
  if (args.includes("-h") || args.includes("--help")) {
    usage();
    return;
  }
  gitInherit(["--git-dir", gitDir(), "worktree", "list"]);
}

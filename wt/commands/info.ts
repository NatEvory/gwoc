import { parseArgs } from "node:util";

import { die, normalizeSlug } from "../../common.ts";
import { defaultBranch, gitDir, hubRoot, primaryWorktree, worktreePath } from "../../git.ts";

function usageRoot(): void {
  process.stdout.write(`Usage: gwoc root

Print the hub root (parent directory of the bare repo).

Options:
  -h, --help         Show help
`);
}

function usageDir(): void {
  process.stdout.write(`Usage: gwoc dir

Print the bare repo path.

Options:
  -h, --help         Show help
`);
}

function usagePrimary(): void {
  process.stdout.write(`Usage: gwoc primary

Print the primary worktree path.

Options:
  -h, --help         Show help
`);
}

function usageDefault(): void {
  process.stdout.write(`Usage: gwoc default

Print the default branch name.

Options:
  -h, --help         Show help
`);
}

function usagePath(): void {
  process.stdout.write(`Usage: gwoc path <slug>

Print the worktree path for a slug.

Options:
  -h, --help         Show help
`);
}

export function wtRoot(args: string[]): void {
  if (args.includes("-h") || args.includes("--help")) {
    usageRoot();
    return;
  }
  parseArgs({ args, options: {} });
  process.stdout.write(hubRoot() + "\n");
}

export function wtDir(args: string[]): void {
  if (args.includes("-h") || args.includes("--help")) {
    usageDir();
    return;
  }
  parseArgs({ args, options: {} });
  process.stdout.write(gitDir() + "\n");
}

export function wtPrimary(args: string[]): void {
  if (args.includes("-h") || args.includes("--help")) {
    usagePrimary();
    return;
  }
  parseArgs({ args, options: {} });
  process.stdout.write(primaryWorktree() + "\n");
}

export function wtDefault(args: string[]): void {
  if (args.includes("-h") || args.includes("--help")) {
    usageDefault();
    return;
  }
  parseArgs({ args, options: {} });
  process.stdout.write(defaultBranch() + "\n");
}

export function wtPath(args: string[]): void {
  if (args.includes("-h") || args.includes("--help")) {
    usagePath();
    return;
  }
  const { positionals } = parseArgs({ args, options: {}, allowPositionals: true });
  const slug = normalizeSlug(positionals[0] || "");
  if (!slug) {
    die("Missing slug");
  }
  process.stdout.write(worktreePath(slug) + "\n");
}

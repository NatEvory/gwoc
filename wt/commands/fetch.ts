import { parseArgs } from "node:util";

import { gitDir, runGit } from "../../git.ts";

function usage(): void {
  process.stdout.write(`Usage: gwoc fetch [--remote <name>]

Fetch refs into the bare repo.

Options:
  --remote <name>    Remote name (default: origin)
  -h, --help         Show help
`);
}

export function wtFetch(args: string[]): void {
  if (args.includes("-h") || args.includes("--help")) {
    usage();
    return;
  }

  const { values } = parseArgs({
    args,
    options: {
      remote: { type: "string", default: "origin" },
    },
  });

  runGit(["--git-dir", gitDir(), "fetch", values.remote as string]);
}

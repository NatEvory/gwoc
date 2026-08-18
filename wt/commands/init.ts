import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

import { die } from "../../common.ts";
import { abspath, isInsideRepo, requireGitRelativePaths, runGit } from "../../git.ts";
import { resolveHubRoot } from "../helpers.ts";
import { runHooks } from "../hooks.ts";

function usage(): void {
  process.stdout.write(`Usage: gwoc init <name> [--dir <path>] [--branch <name>] [--primary <name>] [--flat] [--force] [--no-hooks]

Initialize a new bare repo hub with a primary worktree.

Creates <dir>/<name>/ as the hub root, containing the bare repo (<name>.git)
and the primary worktree.

Options:
  --dir <path>       Directory to create the hub root in (default: cwd)
  --branch <name>    Default branch name (default: main)
  --primary <name>   Primary worktree directory name (default: branch name)
  --flat             Place the bare repo and worktree directly in --dir
                     instead of creating a <name>/ hub root
  --force            Allow creating a hub inside an existing git repo
  --no-hooks         Skip post-init hooks
  -h, --help         Show help

Hooks:
  post-init hooks run after the hub is created. Lookup order (all run):
    1. $XDG_CONFIG_HOME/gwoc/hooks/post-init  (or ~/.config/gwoc/hooks/post-init)
    2. <hub-root>/.gwoc/hooks/post-init
    3. <primary-worktree>/.gwoc/hooks/post-init
  Env: GWOC_HUB_ROOT, GWOC_BARE_DIR, GWOC_PRIMARY_WORKTREE, GWOC_BRANCH, GWOC_NAME
`);
}

export function wtInit(args: string[]): void {
  if (args.includes("-h") || args.includes("--help")) {
    usage();
    return;
  }
  requireGitRelativePaths();

  const { values, positionals } = parseArgs({
    args,
    options: {
      dir: { type: "string", default: process.cwd() },
      branch: { type: "string", default: "main" },
      primary: { type: "string", default: "" },
      flat: { type: "boolean", default: false },
      force: { type: "boolean", default: false },
      "no-hooks": { type: "boolean", default: false },
    },
    allowPositionals: true,
  });

  const name = positionals[0] || "";
  if (!name) {
    die("Missing name");
  }

  const branch = values.branch as string;
  const wtName = (values.primary as string) || branch;
  const parentAbs = abspath(values.dir as string);

  if (!values.force && isInsideRepo(parentAbs)) {
    die("Target directory is inside a git repo or worktree.\nUse --force to override, or pick a different --dir.");
  }

  const rootAbs = resolveHubRoot(parentAbs, name, values.flat as boolean);
  const bare = path.join(rootAbs, `${name}.git`);
  const worktree = path.join(rootAbs, wtName);
  if (fs.existsSync(bare) || fs.existsSync(worktree)) {
    die(`Target already exists: ${bare} or ${worktree}`);
  }

  fs.mkdirSync(rootAbs, { recursive: true });
  runGit(["init", "--bare", bare]);
  runGit(["--git-dir", bare, "symbolic-ref", "HEAD", `refs/heads/${branch}`]);
  runGit(["--git-dir", bare, "config", "worktree.useRelativePaths", "true"]);
  runGit(["--git-dir", bare, "config", "gwoc.primary", wtName]);
  runGit(["--git-dir", bare, "worktree", "add", "--relative-paths", worktree, "-b", branch]);
  runGit(["-C", worktree, "commit", "--allow-empty", "-m", "Initial commit"]);
  process.stdout.write(`Hub root: ${rootAbs}\n`);
  process.stdout.write(`Bare repo: ${bare}\n`);
  process.stdout.write(`Primary worktree: ${worktree}\n`);

  runHooks(
    "post-init",
    {
      GWOC_HUB_ROOT: rootAbs,
      GWOC_BARE_DIR: bare,
      GWOC_PRIMARY_WORKTREE: worktree,
      GWOC_BRANCH: branch,
      GWOC_NAME: name,
    },
    { hubRoot: rootAbs, worktree, skip: values["no-hooks"] as boolean },
  );
}

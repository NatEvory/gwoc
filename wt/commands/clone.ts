import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { parseArgs } from "node:util";

import { die } from "../../common.ts";
import { abspath, gitExitCode, isInsideRepo, requireGitRelativePaths, runGit } from "../../git.ts";
import { resolveHubRoot } from "../helpers.ts";
import { runHooks } from "../hooks.ts";

function usage(): void {
  process.stdout.write(`Usage: gwoc clone <url> [name] [--dir <path>] [--primary <name>] [--flat] [--force] [--no-hooks]

Clone a remote repo into a bare hub with a primary worktree.

Creates <dir>/<name>/ as the hub root, containing the bare repo (<name>.git)
and the primary worktree.

Options:
  --dir <path>       Directory to create the hub root in (default: cwd)
  --primary <name>   Primary worktree directory name (default: default branch name)
  --flat             Place the bare repo and worktree directly in --dir
                     instead of creating a <name>/ hub root
  --force            Allow cloning into a directory inside an existing git repo
  --no-hooks         Skip post-clone hooks
  -h, --help         Show help

Hooks:
  post-clone hooks run after the clone completes. Lookup order (all run):
    1. $XDG_CONFIG_HOME/gwoc/hooks/post-clone  (or ~/.config/gwoc/hooks/post-clone)
    2. <hub-root>/.gwoc/hooks/post-clone
    3. <primary-worktree>/.gwoc/hooks/post-clone
  Env: GWOC_HUB_ROOT, GWOC_BARE_DIR, GWOC_PRIMARY_WORKTREE, GWOC_BRANCH, GWOC_NAME, GWOC_REMOTE_URL
`);
}

export function wtClone(args: string[]): void {
  if (args.includes("-h") || args.includes("--help")) {
    usage();
    return;
  }
  requireGitRelativePaths();

  const { values, positionals } = parseArgs({
    args,
    options: {
      dir: { type: "string", default: process.cwd() },
      primary: { type: "string", default: "" },
      flat: { type: "boolean", default: false },
      force: { type: "boolean", default: false },
      "no-hooks": { type: "boolean", default: false },
    },
    allowPositionals: true,
  });

  const url = positionals[0] || "";
  if (!url) {
    die("Missing url");
  }

  let name = positionals[1] || "";
  if (!name) {
    const base = url.split("/").pop() || "";
    name = base.endsWith(".git") ? base.slice(0, -4) : base;
  }

  const parentAbs = abspath(values.dir as string);

  if (!values.force && isInsideRepo(parentAbs)) {
    die("Target directory is inside a git repo or worktree.\nUse --force to override, or pick a different --dir.");
  }

  const rootAbs = resolveHubRoot(parentAbs, name, values.flat as boolean);
  const bare = path.join(rootAbs, `${name}.git`);
  if (fs.existsSync(bare)) {
    die(`Target already exists: ${bare}`);
  }

  fs.mkdirSync(rootAbs, { recursive: true });
  runGit(["clone", "--bare", url, bare]);
  // `git clone --bare` leaves remote.origin.fetch empty, so a later `git fetch`
  // is a no-op and branches pushed to origin after clone never become visible
  // (no refs/remotes/origin/* and no new local heads). Configure the standard
  // refspec and fetch once so the hub tracks origin going forward — gwoc fetch,
  // checkout, and sync all rely on remote-tracking refs being kept current.
  runGit(["--git-dir", bare, "config", "remote.origin.fetch", "+refs/heads/*:refs/remotes/origin/*"]);
  runGit(["--git-dir", bare, "fetch", "origin"]);
  runGit(["--git-dir", bare, "config", "worktree.useRelativePaths", "true"]);

  let branch = "";
  const headRef = spawnSync("git", ["--git-dir", bare, "symbolic-ref", "-q", "HEAD"], { encoding: "utf8" });
  const headOut = (headRef.stdout || "").trim();
  if (headOut) {
    branch = headOut.replace(/^refs\/heads\//, "");
  } else {
    branch = gitExitCode(["--git-dir", bare, "show-ref", "--verify", "--quiet", "refs/heads/main"]) === 0
      ? "main"
      : "master";
  }

  const wtName = (values.primary as string) || branch;
  const worktree = path.join(rootAbs, wtName);
  if (fs.existsSync(worktree)) {
    die(`Target already exists: ${worktree}`);
  }

  runGit(["--git-dir", bare, "config", "gwoc.primary", wtName]);
  runGit(["--git-dir", bare, "worktree", "add", "--relative-paths", worktree, branch]);
  if (gitExitCode(["--git-dir", bare, "show-ref", "--verify", "--quiet", `refs/remotes/origin/${branch}`]) === 0) {
    runGit(["-C", worktree, "branch", "--set-upstream-to", `origin/${branch}`, branch]);
  }
  process.stdout.write(`Hub root: ${rootAbs}\n`);
  process.stdout.write(`Bare repo: ${bare}\n`);
  process.stdout.write(`Primary worktree: ${worktree}\n`);

  runHooks(
    "post-clone",
    {
      GWOC_HUB_ROOT: rootAbs,
      GWOC_BARE_DIR: bare,
      GWOC_PRIMARY_WORKTREE: worktree,
      GWOC_BRANCH: branch,
      GWOC_NAME: name,
      GWOC_REMOTE_URL: url,
    },
    { hubRoot: rootAbs, worktree, skip: values["no-hooks"] as boolean },
  );
}

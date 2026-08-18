import fs from "node:fs";
import { parseArgs } from "node:util";

import { die, normalizeSlug } from "../../common.ts";
import {
  gitDir,
  gitExitCode,
  gitOutput,
  hubRoot,
  requireGitRelativePaths,
  runGit,
  worktreePath,
} from "../../git.ts";
import { parseWorktreeList } from "../checks.ts";
import { runHooks } from "../hooks.ts";

function usage(): void {
  process.stdout.write(`Usage: gwoc checkout <branch> [--no-fetch] [--no-hooks]

Check out an existing branch into a new worktree. Slug = branch (slashes
become nested directories). By default fetches all remotes first so a
fresh PR branch is reachable.

Resolution order:
  1. Local branch '<branch>' exists  -> check it out
  2. Exactly one remote has it       -> create local tracking branch
  3. Multiple remotes have it        -> prefer 'origin', else error
  4. Not found anywhere              -> error

Options:
  --no-fetch         Skip the upfront fetch
  --no-hooks         Skip post-create hooks
  -h, --help         Show help

Hooks:
  post-create runs after the worktree is created (same as 'gwoc new').
`);
}

interface RemoteMatch {
  remote: string;
  ref: string; // e.g. "origin/someuser/pr-123"
}

function findRemoteMatches(branch: string): RemoteMatch[] {
  const refs = gitOutput([
    "--git-dir",
    gitDir(),
    "for-each-ref",
    "--format=%(refname)",
    "refs/remotes/",
  ])
    .split(/\r?\n/)
    .filter(Boolean);

  const matches: RemoteMatch[] = [];
  for (const fullRef of refs) {
    // refs/remotes/<remote>/<branch-with-possible-slashes>
    const stripped = fullRef.replace(/^refs\/remotes\//, "");
    if (stripped === fullRef) continue;
    const slash = stripped.indexOf("/");
    if (slash < 0) continue;
    const remote = stripped.slice(0, slash);
    const rest = stripped.slice(slash + 1);
    if (rest === branch && rest !== "HEAD") {
      matches.push({ remote, ref: stripped });
    }
  }
  return matches;
}

export function wtCheckout(args: string[]): void {
  if (args.includes("-h") || args.includes("--help")) {
    usage();
    return;
  }
  requireGitRelativePaths();

  const { values, positionals } = parseArgs({
    args,
    options: {
      "no-fetch": { type: "boolean", default: false },
      "no-hooks": { type: "boolean", default: false },
    },
    allowPositionals: true,
  });

  const raw = positionals[0] || "";
  if (!raw) {
    die("Missing branch");
  }
  const branch = normalizeSlug(raw);
  const slug = branch;
  const target = worktreePath(slug);

  if (fs.existsSync(target)) {
    die(
      `Worktree path already exists: ${target}\n` +
        `Run 'gwoc rm ${slug}' to remove it, or 'gwoc pull ${slug}' / 'gwoc sync' to update it in place.`,
    );
  }

  if (!values["no-fetch"]) {
    const remotes = gitOutput(["--git-dir", gitDir(), "remote"])
      .split(/\r?\n/)
      .filter(Boolean);
    if (remotes.length > 0) {
      process.stdout.write("Fetching all remotes...\n");
      runGit(["--git-dir", gitDir(), "fetch", "--all", "--prune"]);
    }
  }

  const localExists =
    gitExitCode([
      "--git-dir",
      gitDir(),
      "show-ref",
      "--verify",
      "--quiet",
      `refs/heads/${branch}`,
    ]) === 0;

  if (localExists) {
    const inUse = parseWorktreeList().some((e) => e.branch === branch);
    if (inUse) {
      die(
        `Branch '${branch}' is already checked out in another worktree.\n` +
          `Run 'gwoc list' to find it.`,
      );
    }
    runGit([
      "--git-dir",
      gitDir(),
      "worktree",
      "add",
      "--relative-paths",
      target,
      branch,
    ]);

    // Wire upstream so push/pull work without -u. Hubs created by `gwoc clone`
    // track origin via a standard refspec, so the remote-tracking ref normally
    // exists and we set upstream the usual way. Fall back to writing upstream
    // config by hand for mirror-less bares — a raw `git clone --bare`, or a hub
    // created before gwoc configured a fetch refspec — where refs/heads IS the
    // mirror of origin's heads and there is no refs/remotes/origin/* to target.
    const remotes = gitOutput(["--git-dir", gitDir(), "remote"])
      .split(/\r?\n/)
      .filter(Boolean);
    const hasRemoteTracking =
      gitOutput([
        "--git-dir",
        gitDir(),
        "for-each-ref",
        "--count=1",
        "--format=%(refname)",
        "refs/remotes/origin/",
      ]).length > 0;
    const hasOriginBranchRef =
      gitExitCode([
        "--git-dir",
        gitDir(),
        "show-ref",
        "--verify",
        "--quiet",
        `refs/remotes/origin/${branch}`,
      ]) === 0;
    if (remotes.includes("origin") && hasOriginBranchRef) {
      runGit([
        "--git-dir",
        gitDir(),
        "branch",
        "--set-upstream-to",
        `origin/${branch}`,
        branch,
      ]);
    } else if (remotes.includes("origin") && !hasRemoteTracking) {
      runGit([
        "--git-dir",
        gitDir(),
        "config",
        `branch.${branch}.remote`,
        "origin",
      ]);
      runGit([
        "--git-dir",
        gitDir(),
        "config",
        `branch.${branch}.merge`,
        `refs/heads/${branch}`,
      ]);
    }
  } else {
    const matches = findRemoteMatches(branch);
    if (matches.length === 0) {
      const hint = values["no-fetch"]
        ? " (try without --no-fetch to pull fresh remote refs)"
        : "";
      die(`Branch '${branch}' not found locally or on any remote${hint}.`);
    }

    let chosen: RemoteMatch;
    if (matches.length === 1) {
      chosen = matches[0];
    } else {
      const origin = matches.find((m) => m.remote === "origin");
      if (origin) {
        chosen = origin;
      } else {
        const remotes = matches.map((m) => m.remote).join(", ");
        die(
          `Branch '${branch}' exists on multiple remotes (${remotes}) and none is 'origin'.\n` +
            `Disambiguate by running 'git --git-dir=${gitDir()} branch ${branch} ${matches[0].ref}' first, then 'gwoc checkout ${branch}'.`,
        );
      }
    }

    runGit([
      "--git-dir",
      gitDir(),
      "worktree",
      "add",
      "--relative-paths",
      "--track",
      "-b",
      branch,
      target,
      chosen.ref,
    ]);
  }

  process.stdout.write(`Worktree: ${target}\n`);
  process.stdout.write(`Branch: ${branch}\n`);

  const root = hubRoot();
  runHooks(
    "post-create",
    {
      GWOC_SLUG: slug,
      GWOC_BRANCH: branch,
      GWOC_BASE_BRANCH: branch,
      GWOC_WORKTREE: target,
      GWOC_HUB_ROOT: root,
    },
    { worktree: target, hubRoot: root, skip: values["no-hooks"] as boolean },
  );
}

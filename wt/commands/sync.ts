import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { parseArgs } from "node:util";

import { defaultBranch, gitDir, gitExitCode, gitOutput, hubRoot, primaryWorktree, runGit } from "../../git.ts";
import { liveWorktreePaths } from "../checks.ts";
import { tryCurrentBranch } from "../helpers.ts";

function usage(): void {
  process.stdout.write(`Usage: gwoc sync [--remote <name>] [--no-fetch] [--merge] [--stop-on-conflict]

Fetch the default branch from the remote and update every live worktree:
  - worktrees on the default branch: fast-forward to <remote>/<default>
  - feature worktrees: rebase onto <remote>/<default>

Worktrees with uncommitted changes or in detached HEAD are skipped.
If a rebase hits a conflict, it is aborted automatically (restoring the
worktree to its pre-sync state) and sync moves on to the next worktree.
Conflicting worktrees are listed at the end so you can resolve them manually.

Options:
  --remote <name>      Remote to fetch from (default: origin)
  --no-fetch           Skip the upfront fetch
  --merge              Use 'git merge' instead of 'git rebase' on feature worktrees
  --stop-on-conflict   On conflict, leave the worktree mid-rebase/-merge for you
                       to resolve, and stop sync (previous default behavior).
  -h, --help           Show help
`);
}

interface Ctx {
  def: string;
  remote: string;
  useMerge: boolean;
  stopOnConflict: boolean;
  primary: string;
  /** Ref to sync against, e.g. "origin/main". */
  target: string;
}

function isDirty(wt: string): boolean {
  return gitOutput(["-C", wt, "status", "--porcelain"]).length > 0;
}

function rebaseInProgress(wt: string): boolean {
  // In gwoc worktrees, <wt>/.git is a file pointing into the bare's worktree
  // admin dir — so rebase state lives there, not under <wt>/.git. Resolve the
  // real git dir via rev-parse.
  const res = spawnSync("git", ["-C", wt, "rev-parse", "--git-dir"], { encoding: "utf8" });
  if (res.status !== 0) return false;
  const gitDir = path.resolve(wt, (res.stdout || "").trim());
  return (
    fs.existsSync(path.join(gitDir, "rebase-merge")) ||
    fs.existsSync(path.join(gitDir, "rebase-apply"))
  );
}

function fastForward(wt: string, target: string, label: string): boolean {
  const before = gitOutput(["-C", wt, "rev-parse", "HEAD"]);
  const ff = gitExitCode(["-C", wt, "merge", "--ff-only", target]);
  if (ff !== 0) {
    process.stdout.write(`${label}: skipped (not fast-forwardable from ${target})\n`);
    return false;
  }
  const after = gitOutput(["-C", wt, "rev-parse", "HEAD"]);
  if (before === after) {
    process.stdout.write(`${label}: up to date\n`);
  } else {
    const n = gitOutput(["-C", wt, "rev-list", "--count", `${before}..${after}`]);
    process.stdout.write(`${label}: fast-forwarded ${n} commit(s)\n`);
  }
  return true;
}

type RebaseOutcome = "ok" | "conflict-aborted" | "conflict-kept";

function rebaseOrMerge(wt: string, onto: string, label: string, ctx: Ctx): RebaseOutcome {
  const verb = ctx.useMerge ? "merge" : "rebase";
  const res = spawnSync("git", ["-C", wt, verb, onto], { stdio: "inherit" });
  if (res.status === 0) {
    process.stdout.write(`${label}: ${verb}d onto ${onto}\n`);
    return "ok";
  }
  if (ctx.stopOnConflict) {
    process.stdout.write(
      `${label}: ${verb} conflict. Resolve in ${wt}, then re-run 'gwoc sync'.\n`,
    );
    return "conflict-kept";
  }
  // Auto-abort to restore the worktree to its pre-sync state.
  const abortCmd = ctx.useMerge ? "merge" : "rebase";
  const abort = spawnSync("git", ["-C", wt, abortCmd, "--abort"], { stdio: "ignore" });
  if (abort.status === 0) {
    process.stdout.write(
      `${label}: skipped (${verb} would conflict; aborted to restore clean state)\n`,
    );
  } else {
    // Unusual — abort itself failed. Tell the user.
    process.stdout.write(
      `${label}: ${verb} conflict AND abort failed. Check ${wt} manually.\n`,
    );
  }
  return "conflict-aborted";
}

type SyncOutcome = "ok" | "skip" | "conflict-skipped" | "conflict-stop";

function syncOne(wt: string, ctx: Ctx): SyncOutcome {
  const label = path.relative(hubRoot(), wt);

  // Check rebase-in-progress before detached-HEAD: an in-progress rebase
  // also has HEAD detached, but the right message is "resolve first".
  if (rebaseInProgress(wt)) {
    process.stdout.write(`${label}: skipped (rebase in progress — resolve first)\n`);
    return "skip";
  }

  const branch = tryCurrentBranch(wt);
  if (branch === null) {
    process.stdout.write(`${label}: skipped (detached HEAD)\n`);
    return "skip";
  }
  if (isDirty(wt)) {
    process.stdout.write(`${label}: skipped (dirty)\n`);
    return "skip";
  }

  // On the default branch → fast-forward to <remote>/<default>.
  if (branch === ctx.def) {
    return fastForward(wt, ctx.target, label) ? "ok" : "skip";
  }

  // Feature branch → rebase (or merge) onto <remote>/<default>.
  const outcome = rebaseOrMerge(wt, ctx.target, label, ctx);
  if (outcome === "ok") return "ok";
  if (outcome === "conflict-aborted") return "conflict-skipped";
  return "conflict-stop";
}

export function wtSync(args: string[]): void {
  if (args.includes("-h") || args.includes("--help")) {
    usage();
    return;
  }

  const { values } = parseArgs({
    args,
    options: {
      remote: { type: "string", default: "origin" },
      "no-fetch": { type: "boolean", default: false },
      merge: { type: "boolean", default: false },
      "stop-on-conflict": { type: "boolean", default: false },
    },
  });

  const def = defaultBranch();
  const remote = values.remote as string;
  const ctx: Ctx = {
    def,
    remote,
    useMerge: Boolean(values.merge),
    stopOnConflict: Boolean(values["stop-on-conflict"]),
    primary: primaryWorktree(),
    target: `${remote}/${def}`,
  };

  if (!values["no-fetch"]) {
    const remotes = gitOutput(["--git-dir", gitDir(), "remote"]).split(/\r?\n/).filter(Boolean);
    if (remotes.includes(remote)) {
      process.stdout.write(`Fetching ${remote}/${def}...\n`);
      // Explicit refspec: bare repos from `gwoc clone` don't always have a
      // remote.<remote>.fetch configured, so a plain `git fetch <remote>` may
      // be a no-op. This fetches the default branch into the remote-tracking
      // ref we then compare against.
      runGit([
        "--git-dir",
        gitDir(),
        "fetch",
        remote,
        `+refs/heads/${def}:refs/remotes/${remote}/${def}`,
      ]);
    } else {
      process.stdout.write(`No '${remote}' remote configured; skipping fetch.\n`);
    }
  }

  // If the target ref doesn't exist (e.g. --no-fetch on a fresh hub), bail early.
  if (
    gitExitCode([
      "--git-dir",
      gitDir(),
      "show-ref",
      "--verify",
      "--quiet",
      `refs/remotes/${ctx.target}`,
    ]) !== 0
  ) {
    process.stdout.write(`No ref ${ctx.target}; nothing to sync against.\n`);
    return;
  }

  // Sync primary first so it's in a known-good state for logs, even though
  // feature worktrees rebase onto the remote-tracking ref directly.
  const allPaths = liveWorktreePaths();
  const primaryPath = path.resolve(ctx.primary);
  const ordered = [
    ...allPaths.filter((p) => path.resolve(p) === primaryPath),
    ...allPaths.filter((p) => path.resolve(p) !== primaryPath),
  ];

  const conflicted: string[] = [];
  for (const wt of ordered) {
    const result = syncOne(wt, ctx);
    if (result === "conflict-skipped") {
      conflicted.push(path.relative(hubRoot(), wt));
    } else if (result === "conflict-stop") {
      // --stop-on-conflict: leave it in-progress and bail so the user can fix.
      process.exit(1);
    }
  }

  if (conflicted.length > 0) {
    process.stdout.write(
      `\nConflicts (${conflicted.length}) — these worktrees were restored to their pre-sync state:\n`,
    );
    for (const slug of conflicted) {
      process.stdout.write(`  - ${slug}\n`);
    }
    process.stdout.write(
      `Resolve manually with 'gwoc rebase <slug>' or by hand, then re-run 'gwoc sync'.\n`,
    );
  }
}

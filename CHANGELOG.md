# Changelog

Notable changes to gwoc. Versions before 0.15.0 predate the public repository;
their entries are summarized from the private development history.

## 0.15.0 — 2026-08-13

- **Breaking:** `init` and `clone` now create the hub root directory themselves.
  `gwoc clone .../my-repo.git` run from `~/dev` produces `~/dev/my-repo/`
  containing `my-repo.git` (bare repo) and `main/` (primary worktree), instead
  of placing both directly in the current directory.
  - A pre-created **empty** `<name>/` directory is reused; a non-empty one is
    refused.
  - Pass `--flat` to `init`/`clone` for the previous behavior (bare repo and
    worktree directly in `--dir`/cwd).
  - Existing hubs are unaffected; commands still locate the hub from the cwd.

## 0.14.2 — 2026-06-09

- Fix `clone`: configure the standard fetch refspec
  (`+refs/heads/*:refs/remotes/origin/*`) and run an initial fetch, so hubs
  track origin after cloning. Previously branches pushed to origin after the
  clone were invisible to `fetch`/`checkout`.
- `checkout` sets upstream via `--set-upstream-to origin/<branch>` when the
  remote-tracking ref exists, falling back to manual config for mirror-less
  bare repos (including hubs cloned before this fix).

## 0.14.1 — 2026-05-12

- Ship a Claude Code skill as an APM package under `apm/`.

## 0.14.0 — 2026-04-29

- Add `checkout` (alias `co`): check an existing local or remote branch out
  into a worktree, with upstream tracking. Branch names with slashes produce
  nested worktree directories.

## 0.13.0 — 2026-04-29

- Add `sync`: fetch once, then fast-forward the primary worktree and rebase
  (or `--merge`) every other worktree onto the default branch. Conflicting
  worktrees are skipped with an auto-abort by default; `--stop-on-conflict`
  leaves the rebase in progress instead.

## 0.12.0 — 2026-04-29

- Add `completion <bash|zsh|fish>` with worktree-slug completion.
- Add compiled single-file binaries via `bun build --compile`.

## 0.11.0 — 2026-04-29

- Add `doctor --fix` for interactive hub repair.

## 0.10.0 — 2026-04-16

- Add `manage` (alias `ui`): interactive worktree manager.

## 0.9.x — 2026-04

- Add `doctor` health checks and `status` warnings; batch orphan-branch
  detection for speed.

## 0.8.0 — 2026-04-09

- Add `rename` (alias `mv`): move a worktree directory and rename its branch
  together.

## 0.7.0 and earlier — 2026-03/04

- Core commands: `init`, `clone`, `new`, `merge`, `rebase`, `fetch`, `push`,
  `pull`, `list`, `rm`, `prune`, and info commands.
- `post-init` / `post-clone` / `post-create` hooks with user-, hub-, and
  worktree-level lookup.

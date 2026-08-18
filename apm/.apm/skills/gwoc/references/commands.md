# gwoc Command Reference

Complete flag reference for every gwoc command.

## Table of contents

- [init](#init)
- [clone](#clone)
- [new](#new)
- [checkout](#checkout)
- [merge](#merge)
- [rebase](#rebase)
- [fetch](#fetch)
- [sync](#sync)
- [push](#push)
- [pull](#pull)
- [list](#list)
- [status](#status)
- [rename](#rename)
- [rm](#rm)
- [prune](#prune)
- [doctor](#doctor)
- [manage](#manage)
- [completion](#completion)
- [info commands](#info-commands)

## init

Create a new bare repo hub with a primary worktree.

```
gwoc init <name> [--dir <path>] [--branch <name>] [--primary <name>] [--flat] [--force] [--no-hooks]
```

| Flag | Default | Description |
|------|---------|-------------|
| `--dir <path>` | cwd | Directory to create the hub root in |
| `--branch <name>` | main | Default branch name |
| `--primary <name>` | branch name | Primary worktree directory name |
| `--flat` | false | Place the bare repo and worktree directly in `--dir` (no `<name>/` hub root) |
| `--force` | false | Allow creating a hub inside an existing git repo |
| `--no-hooks` | false | Skip `post-init` hooks |

Creates: `<dir>/<name>/` (hub root) containing `<name>.git` (bare repo) + `<primary>` (worktree on default branch). An existing empty `<dir>/<name>/` is reused; a non-empty one is refused. With `--flat`, the bare repo and worktree land directly in `<dir>` (pre-0.15 layout). Refuses if target is inside a git repo unless `--force` is passed.

## clone

Clone a remote repo into a bare hub with a primary worktree.

```
gwoc clone <url> [name] [--dir <path>] [--primary <name>] [--flat] [--force] [--no-hooks]
```

| Flag | Default | Description |
|------|---------|-------------|
| `[name]` | derived from URL | Hub name |
| `--dir <path>` | cwd | Directory to create the hub root in |
| `--primary <name>` | default branch name | Primary worktree directory name |
| `--flat` | false | Place the bare repo and worktree directly in `--dir` (no `<name>/` hub root) |
| `--force` | false | Allow cloning into a directory inside an existing git repo |
| `--no-hooks` | false | Skip `post-clone` hooks |

Creates `<dir>/<name>/` as the hub root, clones into a bare repo inside it, then creates a primary worktree on the default branch. An existing empty `<dir>/<name>/` is reused; a non-empty one is refused. With `--flat`, the bare repo and worktree land directly in `<dir>` (pre-0.15 layout). Refuses if target is inside a git repo unless `--force` is passed. Note: `git clone --bare` leaves `remote.origin.fetch` empty, so gwoc configures the standard refspec (`+refs/heads/*:refs/remotes/origin/*`) and runs an initial fetch. The hub tracks origin going forward, and branches pushed to origin after clone are discoverable via `gwoc fetch` / `checkout` / `sync`.

## new

Create a new worktree and branch.

```
gwoc new <slug> [--branch <name>] [--no-hooks]
```

| Flag | Default | Description |
|------|---------|-------------|
| `--branch <name>` | repo default branch | Base branch for the new worktree |
| `--no-hooks` | false | Skip post-create hooks |

Creates `<hub-root>/<slug>/` with a new branch named `<slug>` based off the specified base branch. Runs `.gwoc/hooks/post-create` if present (unless `--no-hooks`).

## checkout

Check out an existing branch into a new worktree (alias: `co`).

```
gwoc checkout <branch> [--no-fetch] [--no-hooks]
```

| Flag | Default | Description |
|------|---------|-------------|
| `--no-fetch` | false | Skip the upfront `git fetch --all --prune` |
| `--no-hooks` | false | Skip `post-create` hooks |

Slug = branch verbatim, so slashes nest (e.g. `user/pr-123` lands at `<hub>/user/pr-123`). Resolution order after fetch:

1. `refs/heads/<branch>` exists → check it out, and set its upstream to `origin/<branch>` when that remote-tracking ref exists. For mirror-less bares (no `refs/remotes/origin/*`, e.g. a raw `git clone --bare`), set `branch.<name>.{remote,merge}` directly instead so push/pull work without `-u`.
2. Exactly one `refs/remotes/*/<branch>` → create local tracking branch with `--track -b`.
3. Multiple remotes have it → prefer `origin`; otherwise error.
4. Not found anywhere → error.

Errors if the worktree path is already taken or the branch is already checked out in another worktree.

## merge

Merge a worktree branch into the primary worktree.

```
gwoc merge <slug> [--into <branch>]
```

| Flag | Default | Description |
|------|---------|-------------|
| `--into <branch>` | current branch in primary | Target branch to merge into |

Targets the worktree that currently has `<branch>` checked out, falling back to the primary worktree. Refuses if the target worktree has uncommitted changes.

## rebase

Rebase a worktree branch onto the latest target branch.

```
gwoc rebase <slug> [--onto <branch>] [--no-fetch]
```

| Flag | Default | Description |
|------|---------|-------------|
| `--onto <branch>` | default branch | Branch to rebase onto |
| `--no-fetch` | false | Skip fetching before rebase |

Fetches from origin before rebasing (skipped automatically if no remote is configured). Refuses if the worktree has uncommitted changes. Rebase runs in the worktree directory so conflicts can be resolved there.

## fetch

Fetch refs into the bare repo.

```
gwoc fetch [--remote <name>]
```

| Flag | Default | Description |
|------|---------|-------------|
| `--remote <name>` | origin | Remote to fetch from |

## sync

Fetch the default branch and update every live worktree in one command.

```
gwoc sync [--remote <name>] [--no-fetch] [--merge] [--stop-on-conflict]
```

| Flag | Default | Description |
|------|---------|-------------|
| `--remote <name>` | origin | Remote to fetch from |
| `--no-fetch` | false | Skip the upfront fetch |
| `--merge` | false | Use `git merge` instead of `git rebase` on feature worktrees |
| `--stop-on-conflict` | false | On conflict, leave the worktree mid-rebase/-merge and exit non-zero |

Walks every live worktree:
- Worktree on the default branch → fast-forward to `<remote>/<default>`.
- Feature worktree → rebase (or `--merge`) onto `<remote>/<default>`.

Skips dirty trees, detached HEAD, and in-progress rebases. By default conflicts auto-abort (restoring the pre-sync state) and sync continues; conflicting slugs are listed at the end. `--stop-on-conflict` reverts to the old "leave it mid-rebase" behavior.

## push

Push a worktree branch to a remote.

```
gwoc push <slug> [--remote <name>] [--branch <name>] [--set-upstream]
```

| Flag | Default | Description |
|------|---------|-------------|
| `--remote <name>` | origin | Remote to push to |
| `--branch <name>` | current branch in worktree | Branch to push |
| `--set-upstream` | false | Set upstream without prompting |

If the branch has no upstream, sets one automatically. If changing an existing upstream, prompts unless `--set-upstream` is passed.

## pull

Pull a remote branch into a worktree.

```
gwoc pull <slug> [--remote <name>] [--branch <name>]
```

| Flag | Default | Description |
|------|---------|-------------|
| `--remote <name>` | origin | Remote to pull from |
| `--branch <name>` | current branch in worktree | Branch to pull |

## list

List all worktrees in the hub.

```
gwoc list
gwoc ls
```

No flags. Aliases: `list`, `ls`.

## status

Show worktree info: branch, file changes, remote tracking, last commit.

```
gwoc status [slug]
```

| Argument | Default | Description |
|----------|---------|-------------|
| `[slug]` | all worktrees | Show status for a specific worktree |

## rename

Rename a worktree directory and its branch in one go (alias: `mv`).

```
gwoc rename <old> <new> [--force]
gwoc mv <old> <new> [--force]
```

| Flag | Default | Description |
|------|---------|-------------|
| `--force` | false | Rename even with uncommitted changes |

Renames `<hub-root>/<old>` to `<hub-root>/<new>` and the branch from `<old>` to `<new>`. Refuses if the worktree has uncommitted changes unless `--force` is passed.

## rm

Remove a worktree directory.

```
gwoc rm <slug> [--prune] [--force]
gwoc remove <slug> [--prune] [--force]
```

| Flag | Default | Description |
|------|---------|-------------|
| `--prune` | false | Also delete the branch |
| `--force` | false | Remove even with uncommitted changes; force-delete branch with --prune |

Aliases: `rm`, `remove`.

## prune

Prune stale worktree references from the bare repo.

```
gwoc prune
```

No flags. Cleans up references to worktrees that no longer exist on disk.

## doctor

Run health checks on the hub (alias: `check`).

```
gwoc doctor [--merged] [--fix]
```

| Flag | Default | Description |
|------|---------|-------------|
| `--merged` | false | Also list orphan branches already merged into default |
| `--fix` | false | Interactively fix issues with safe automatic repairs |

Per-worktree checks: slug/branch mismatch, detached HEAD, upstream gone. Hub-wide: orphan branches, prunable worktree entries, missing primary worktree. Exits non-zero if issues are found (zero in `--fix` mode regardless — re-run plain `doctor` to verify).

`--fix` prompts for each issue: prune stale entries, rename mismatched directories (via `gwoc rename`), unset gone upstreams, delete merged orphans, force-delete unmerged orphans (per-branch confirm, defaults to no). Ctrl-C bails cleanly.

## manage

Interactive worktree manager (alias: `ui`).

```
gwoc manage
gwoc ui
```

No flags. Arrow-key TUI for selecting a worktree and an action (status, rename, rm, merge, push, pull, rebase, new). Esc cancels at any level. Uses `@inquirer/prompts`; requires a real TTY.

## completion

Print a shell completion script for installation.

```
gwoc completion <bash|zsh|fish>
```

Install by evaluating in your shell rc:

```bash
# bash — ~/.bashrc
eval "$(gwoc completion bash)"

# zsh — ~/.zshrc (after compinit)
eval "$(gwoc completion zsh)"

# fish — ~/.config/fish/config.fish
gwoc completion fish | source
```

Completes subcommands at position 1, and worktree slugs at position 2 for slug-taking commands (`rm`, `rename`, `status`, `merge`, `push`, `pull`, `rebase`, `path`).

## info commands

Simple commands that print paths or metadata.

```
gwoc root       # Hub root directory (parent of bare repo)
gwoc dir        # Bare repo path (<name>.git)
gwoc primary    # Primary worktree path
gwoc path <slug>  # Worktree path for a given slug
gwoc default    # Default branch name (main/master)
```

No flags on any of these (except `--git-dir` global override).

---
name: gwoc
description: >-
  This skill manages git worktree hubs using the gwoc CLI. It should be used
  when the user mentions "gwoc", "worktree", "worktrees", "hub", "bare repo",
  or wants to work on multiple branches in parallel. Also applies when
  creating, listing, merging, pushing, pulling, or removing worktrees, or when
  working inside a gwoc hub directory structure.
---

# gwoc — Git Worktree Orchestration CLI

gwoc manages **hubs**: a bare git repo plus lightweight worktree directories, one per branch. This lets you work on multiple branches simultaneously without stashing or switching.

## Hub architecture

```
myproject/              # hub root
├── myproject.git/      # bare repo (central store, no working files)
├── main/               # primary worktree (default branch)
├── feature-a/          # worktree for feature-a branch
└── bugfix-123/         # worktree for bugfix-123 branch
```

- **Hub root** is the parent directory. Commands work from anywhere inside the hub: the hub root, any worktree (at any depth), or other hub subdirectories.
- **Primary worktree** tracks the default branch. Merges target it by default.
- **Additional worktrees** are created with `gwoc new` or `gwoc checkout` and map 1:1 to branches.
- **Slug = branch.** Branch names with slashes (e.g. `user/pr-123`) produce nested worktree directories.

## Setting up a hub

`gwoc init` and `gwoc clone` create the hub root (`<name>/`) inside the current directory (or `--dir <path>`), with the bare repo (`<name>.git/`) and primary worktree inside it. Running `gwoc clone git@host:me/foo.git` from `~/dev` produces `~/dev/foo/` containing `foo.git/` and `main/`.

```bash
# From scratch
gwoc init myproject [--dir <path>] [--branch <name>] [--primary <name>] [--flat]

# From a remote
gwoc clone <url> [name] [--dir <path>] [--primary <name>] [--flat]
```

Run them from the workspace directory that should *contain* the hub (e.g. `~/dev`, `~/projects`) — the hub root is created for you. An existing **empty** directory named `<name>` is reused, so a pre-created `mkdir foo` is fine; a non-empty one is refused.

Situations to check first:

1. **User is already in a hub root** (a `<name>.git` directory exists here) — they probably don't need init/clone. Confirm before proceeding.
2. **User has already created and entered a dedicated, non-empty hub directory** and wants the hub materialized *here* — pass `--flat` to place `<name>.git/` and the primary worktree directly in the cwd instead of nesting another `<name>/` (this was the default before 0.15).
3. **User is inside a worktree or git repo** — wrong place; init/clone refuse (override with `--force`). Navigate up or use `--dir`.
4. **Ambiguous intent** — if it's unclear where the hub should land, ask before running the command.

## Key commands

### Creating worktrees

```bash
gwoc new <slug> [--branch <base>] [--no-hooks]      # create worktree + new branch
gwoc checkout <branch> [--no-fetch] [--no-hooks]    # check out an existing branch (alias: co)
```

- `new` creates a fresh branch off `<base>` (default branch by default). Slug becomes the branch name.
- `checkout` is for PR review and similar — auto-fetches all remotes, then resolves the branch to either a local head or a remote-tracking ref. Slug = branch verbatim (slashes welcome).

### Inspecting and managing worktrees

```bash
gwoc list                                          # list all worktrees (alias: ls)
gwoc status [slug]                                 # branch, changes, remote tracking
gwoc path <slug>                                   # print worktree path
gwoc rename <old> <new> [--force]                  # rename worktree + branch (alias: mv)
gwoc rm <slug> [--prune] [--force]                 # remove worktree (--prune deletes branch too)
gwoc prune                                         # clean up stale worktree references
gwoc manage                                        # interactive TUI (alias: ui)
```

### Syncing and merging

```bash
gwoc fetch [--remote <name>]                       # fetch into bare repo
gwoc sync [--remote <r>] [--no-fetch] [--merge]    # fetch + update every worktree
                                                    #   [--stop-on-conflict]
gwoc push <slug> [--remote <r>] [--set-upstream]   # push worktree branch
gwoc pull <slug> [--remote <r>]                    # pull into worktree
gwoc rebase <slug> [--onto <branch>] [--no-fetch]  # rebase worktree onto latest
gwoc merge <slug> [--into <branch>]                # merge into primary (or another) worktree
```

- `sync` fast-forwards the primary worktree and rebases (or `--merge`s) every feature worktree onto `<remote>/<default>`. Dirty, detached, and in-progress-rebase worktrees are skipped. Conflicts auto-abort and report at the end; `--stop-on-conflict` leaves them mid-rebase instead.

### Hub health and shell integration

```bash
gwoc doctor [--merged] [--fix]                     # health checks; --fix offers interactive repairs
gwoc completion <bash|zsh|fish>                    # print shell completion script
```

- `doctor --fix` walks each finding and prompts: prune stale entries, rename mismatched dirs, unset gone upstreams, delete merged orphans, force-delete unmerged orphans (per-branch confirm, defaults to no). Ctrl-C bails cleanly.
- Install completion with e.g. `eval "$(gwoc completion bash)"`.

### Hub info

```bash
gwoc root       # hub root path
gwoc dir        # bare repo path
gwoc primary    # primary worktree path
gwoc default    # default branch name (main/master)
```

### Global options

- `--git-dir <path>` or `GWOC_GIT_DIR` env var — override bare repo location
- Every command supports `-h` / `--help` for per-command usage

For full flag details on every command, read `references/commands.md` in this skill's directory.

## Common workflows

### Create a hub and start working

```bash
gwoc clone https://github.com/user/repo.git
cd repo
gwoc new feature-x
cd feature-x
# ... edit, commit, etc.
```

### Review a PR

```bash
gwoc checkout user/pr-1234-some-fix    # auto-fetches, checks out into <hub>/user/pr-1234-some-fix
cd user/pr-1234-some-fix
# ... review, run tests, etc.
cd ..
gwoc rm user/pr-1234-some-fix --prune  # tear down when done
```

### Rebase onto latest before merging

```bash
gwoc rebase feature-x         # fetches + rebases onto default branch
gwoc rebase feature-x --onto develop  # rebase onto a specific branch
```

### Merge and clean up

```bash
cd ..              # back to hub root
gwoc merge feature-x
gwoc rm feature-x --prune
```

### Push a branch to remote

```bash
gwoc push feature-x           # pushes to origin by default
gwoc push feature-x --set-upstream  # set upstream without prompting
```

### Bring everything up to date

```bash
gwoc sync          # fetch + fast-forward primary + rebase feature worktrees
```

### Multiple parallel features

```bash
gwoc new feature-a
gwoc new feature-b
gwoc list          # see both worktrees
gwoc status        # see status of all
```

### Diagnose and repair a hub

```bash
gwoc doctor          # report-only; non-zero exit if issues found
gwoc doctor --fix    # interactive repair
```

## Hooks

gwoc has three hook events, each with three-level lookup. All matching hooks at all levels run in order.

| Event | Fires after | Env vars |
|-------|-------------|----------|
| `post-init` | `gwoc init` | `GWOC_HUB_ROOT`, `GWOC_BARE_DIR`, `GWOC_PRIMARY_WORKTREE`, `GWOC_BRANCH`, `GWOC_NAME` |
| `post-clone` | `gwoc clone` | same as `post-init` plus `GWOC_REMOTE_URL` |
| `post-create` | `gwoc new` / `gwoc checkout` | `GWOC_SLUG`, `GWOC_BRANCH`, `GWOC_BASE_BRANCH`, `GWOC_WORKTREE`, `GWOC_HUB_ROOT` |

Lookup order (each path is checked; if the file exists and is executable, it runs):

1. `$XDG_CONFIG_HOME/gwoc/hooks/<event>` (falls back to `~/.config/gwoc/hooks/<event>`) — user-level, machine-local
2. `<hub-root>/.gwoc/hooks/<event>` — per-hub, not inside a worktree (doesn't need to be committed)
3. `<worktree>/.gwoc/hooks/<event>` — committed in the repo, inherited by new worktrees

All three hook-firing commands accept `--no-hooks` to skip. Hooks without a shebang are retried under `bash` after an `ENOEXEC`.

Example `post-create` that installs dependencies:

```bash
#!/usr/bin/env bash
echo "Setting up $GWOC_SLUG..."
npm install
```

## Important details

- Commands resolve the hub from anywhere inside it (hub root, worktrees, subdirectories). Inside an unrelated git repo they refuse; use `--git-dir` / `GWOC_GIT_DIR` there.
- `rm` and `rename` refuse to operate on the worktree containing the cwd; cd out first.
- Slugs are normalized (trailing slashes stripped). Branch names with `/` create nested worktree directories.
- `gwoc merge` refuses to merge if the target worktree has uncommitted changes.
- `gwoc rm` refuses to remove worktrees with uncommitted changes unless `--force` is passed.
- `gwoc checkout` errors if the worktree path is already taken, or if the branch is already checked out in another worktree.
- Requires git >= 2.35.0 (for `--relative-paths` support).
- Config is stored in the bare repo's git config (`gwoc.primary`, `worktree.useRelativePaths`).
- Distributed as self-contained binaries from GitHub Releases (install script: `curl -fsSL https://raw.githubusercontent.com/NatEvory/gwoc/main/install.sh | sh`; glibc Linux and macOS — not musl/Alpine), or run from source with Bun.

# gwoc

[![CI](https://github.com/NatEvory/gwoc/actions/workflows/ci.yml/badge.svg)](https://github.com/NatEvory/gwoc/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/NatEvory/gwoc)](https://github.com/NatEvory/gwoc/releases/latest)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**G**it **W**orktree **O**rchestration **C**LI — manage bare-repo hubs with one worktree per branch, so you can work on many branches in parallel, each in its own directory, with no stashing or branch switching.

![gwoc demo](demo/demo.gif)

> **A note from the author:** gwoc is a tool I built with a lot of help from AI coding agents to make my own multi-branch workflow easier. I initially had no intention of releasing it publicly, but a few people asked about it, so here it is. Most of the code and docs are AI-generated, under my direction and review. Feedback and bug reports are very welcome. I hope it helps you as much as it helps me.

## Install

### Install script (Linux / macOS)

```bash
curl -fsSL https://raw.githubusercontent.com/NatEvory/gwoc/main/install.sh | sh
```

Detects your platform, downloads the [latest release](https://github.com/NatEvory/gwoc/releases/latest) binary, verifies its checksum, and installs to `/usr/local/bin` (or `~/.local/bin` if that isn't writable). Pin a version with `GWOC_VERSION=v0.15.0`, or choose a directory with `GWOC_INSTALL=~/bin`.

### Manual binary download

Grab the binary for your platform from the [latest release](https://github.com/NatEvory/gwoc/releases/latest): `gwoc-linux-x64`, `gwoc-linux-arm64`, `gwoc-darwin-x64`, `gwoc-darwin-arm64`, or `gwoc-windows-x64.exe` (Windows builds are currently untested — reports welcome). Each release includes a `SHA256SUMS` file. Make it executable and put it on your `PATH`. No Node or Bun required at runtime.

Requires git >= 2.35.0.

### From source (requires [Bun](https://bun.sh))

```bash
git clone https://github.com/NatEvory/gwoc.git
cd gwoc
bun install
bun link        # exposes `gwoc` on PATH
```

Or run directly: `./gwoc.ts <command>`, or build your own binary with `bun run build`.

## Hub architecture

A "hub" is a parent directory containing:
- A bare git repo: `<name>.git`
- A primary worktree: `<name>` (checked out from the default branch)
- Additional worktrees: `<slug>` (one per branch)

gwoc creates and maintains that layout so you can work on many branches in parallel, each in its own directory. Commands work from anywhere inside the hub: the hub root, any worktree at any depth, or other hub subdirectories.

`init` and `clone` create the hub root for you: `gwoc clone git@host:me/my-repo.git` run from `~/dev` produces

```
~/dev/my-repo/              # hub root
~/dev/my-repo/my-repo.git   # bare repo
~/dev/my-repo/main          # primary worktree (default branch)
```

Pass `--flat` to skip the hub-root directory and place the bare repo and worktree directly in the current directory (the pre-0.15 behavior).

## Quickstart

```bash
cd ~/dev
gwoc clone git@github.com:you/your-repo.git    # creates ~/dev/your-repo/
cd your-repo

gwoc new feature-x        # worktree + branch at ./feature-x
cd feature-x
# ...edit, commit...
cd ..
gwoc merge feature-x      # merge into the primary worktree's branch
gwoc rm feature-x --prune # remove worktree and branch
```

## AI coding agent skill

gwoc ships with a skill that teaches AI coding agents how to operate the CLI. It's an [APM](https://microsoft.github.io/apm/) package living in the `apm/` subdirectory, installable into any APM-supported agent (Claude Code and others):

```bash
apm install -g NatEvory/gwoc/apm
```

Or, from a local clone:

```bash
./apm/install
```

After installation, your agent picks up the skill automatically — invoke it by mentioning gwoc, worktrees, or hubs in conversation. Re-run the install after pulling new commits or editing the skill files; APM compiles on install rather than picking up edits live.

## Commands

```
gwoc init <name> [--dir <path>] [--branch <name>] [--flat] [--no-hooks]
                                                                 Initialize a bare hub
gwoc clone <url> [name] [--dir <path>] [--flat] [--no-hooks]     Clone into a bare hub
gwoc new <slug> [--branch <name>] [--no-hooks]                   Create a worktree on a new branch
gwoc checkout <branch> [--no-fetch] [--no-hooks]                 Check out an existing branch into a worktree
gwoc merge <slug> [--into <branch>]                              Merge worktree branch
gwoc rebase <slug> [--onto <branch>] [--no-fetch]                Rebase worktree branch
gwoc fetch [--remote <name>]                                     Fetch into bare repo
gwoc push <slug> [--remote <name>] [--branch <name>]             Push worktree branch
gwoc pull <slug> [--remote <name>] [--branch <name>]             Pull into worktree
gwoc sync [--remote <name>] [--no-fetch] [--merge] [--stop-on-conflict]
                                                                 Fetch + update all worktrees
gwoc list                                                        List worktrees
gwoc status [slug]                                               Show worktree status
gwoc rm <slug> [--prune] [--force]                               Remove a worktree
gwoc rename <old> <new> [--force]                                Rename a worktree + branch
gwoc prune                                                       Prune stale worktrees
gwoc doctor [--merged] [--fix]                                   Run health checks on the hub
gwoc manage                                                      Interactive worktree manager
gwoc completion <bash|zsh|fish>                                  Print shell completion script
gwoc root                                                        Print hub root
gwoc dir                                                         Print bare repo path
gwoc primary                                                     Print primary worktree
gwoc path <slug>                                                 Print worktree path
gwoc default                                                     Print default branch
```

Aliases: `co` = checkout, `ls` = list, `remove` = rm, `mv` = rename, `check` = doctor, `ui` = manage.

## Hooks

`init`, `clone`, `new`, and `checkout` run optional hook scripts after creating a worktree (`post-init`, `post-clone`, `post-create`). Every matching hook runs, in order: user level (`~/.config/gwoc/hooks/<name>`, honoring `XDG_CONFIG_HOME`), hub level (`<hub>/.gwoc/hooks/<name>`), then worktree level (`<worktree>/.gwoc/hooks/<name>`). Skip them per-invocation with `--no-hooks`.

## Environment

- `GWOC_GIT_DIR` — override hub bare repo path (or use `--git-dir`)

## Merge Behavior

`gwoc merge <source> --into <branch>` merges into the worktree that has `<branch>` checked out, or falls back to the primary worktree if none exists.

## Development

```bash
bun test            # run the test suite
bun run typecheck   # tsc --noEmit
bun run build       # compile a single-file binary for this platform
```

CI runs typecheck, tests, and a compile on every push and PR. Releases are cut by pushing a `v*` tag, which builds and attaches binaries automatically.

See [CHANGELOG.md](CHANGELOG.md) for release history.

## License

[MIT](LICENSE)

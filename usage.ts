export function usage(): void {
  process.stdout.write(`Usage: gwoc <command> [args]

Commands:
  init <name> [options] [--no-hooks]                Initialize a bare hub
  clone <url> [name] [options] [--no-hooks]         Clone into a bare hub
  new <slug> [--branch <name>] [--no-hooks]         Create a worktree
  checkout <branch> [--no-fetch] [--no-hooks]       Check out an existing branch into a worktree
  merge <slug> [--into <branch>]                   Merge worktree branch
  rebase <slug> [--onto <branch>] [--no-fetch]    Rebase worktree branch
  fetch [--remote <name>]                          Fetch into bare repo
  push <slug> [--remote <name>] [--branch <name>]  Push worktree branch
  pull <slug> [--remote <name>] [--branch <name>]  Pull into worktree
  list                                              List worktrees
  rm <slug> [--prune] [--force]                      Remove a worktree
  rename <old> <new> [--force]                      Rename a worktree + branch
  status [slug]                                     Show worktree status
  prune                                             Prune stale worktrees
  doctor [--merged] [--fix]                         Run health checks on the hub
  sync [--remote <name>] [--no-fetch] [--merge] [--stop-on-conflict]  Fetch + update all worktrees
  manage                                            Interactive worktree manager
  completion <bash|zsh|fish>                        Print shell completion script
  root                                              Print hub root
  dir                                               Print bare repo path
  primary                                           Print primary worktree
  path <slug>                                       Print worktree path
  default                                           Print default branch

Options:
  --git-dir <path>            Path to bare repo hub
  -h, --help                  Show help
  -v, --version               Print version

Notes:
  merge --into <branch>       Targets the worktree where <branch> is checked out
`);
}

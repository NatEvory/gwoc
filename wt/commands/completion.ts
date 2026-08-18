const BASH = `_gwoc_complete() {
  local IFS=$'\\n'
  COMPREPLY=($(gwoc __complete "$COMP_CWORD" "\${COMP_WORDS[@]}" 2>/dev/null))
}
complete -F _gwoc_complete gwoc
`;

const ZSH = `_gwoc() {
  local -a out
  out=("\${(f)$(gwoc __complete $((CURRENT - 1)) "\${words[@]}" 2>/dev/null)}")
  compadd -a out
}
compdef _gwoc gwoc
`;

const FISH = `function __gwoc_complete
  set -l tokens (commandline -opc) (commandline -ct)
  set -l cword (math (count $tokens) - 1)
  gwoc __complete $cword $tokens 2>/dev/null
end
complete -c gwoc -f -a '(__gwoc_complete)'
`;

function usage(): void {
  process.stdout.write(`Usage: gwoc completion <bash|zsh|fish>

Print a shell completion script. Install by evaluating in your shell rc:

  # bash — ~/.bashrc
  eval "$(gwoc completion bash)"

  # zsh — ~/.zshrc (after compinit is loaded)
  eval "$(gwoc completion zsh)"

  # fish — ~/.config/fish/config.fish
  gwoc completion fish | source
`);
}

export function wtCompletion(args: string[]): void {
  if (args.includes("-h") || args.includes("--help")) {
    usage();
    return;
  }
  const shell = args[0] ?? "";
  if (shell === "bash") {
    process.stdout.write(BASH);
    return;
  }
  if (shell === "zsh") {
    process.stdout.write(ZSH);
    return;
  }
  if (shell === "fish") {
    process.stdout.write(FISH);
    return;
  }
  usage();
  process.exit(1);
}

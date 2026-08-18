import path from "node:path";
import readline from "node:readline";
import { spawnSync } from "node:child_process";
import { select, input, confirm, Separator } from "@inquirer/prompts";

import { selfInvokeArgv } from "../../common.ts";
import { liveWorktreePaths, worktreeIssues } from "../checks.ts";
import { tryCurrentBranch } from "../helpers.ts";
import { aheadBehind, fileStatus } from "./status.ts";

// Wrap a prompt so Escape cancels it via AbortController. Inquirer rejects the
// prompt with AbortPromptError on signal abort and, with `clearPromptOnDone`
// set in the caller's context, erases the rendered area on settlement — so
// the cancelled menu disappears instead of lingering in the scrollback.
async function withEscape<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  readline.emitKeypressEvents(process.stdin);
  const onKeypress = (_: string | undefined, key: { name?: string } | undefined) => {
    if (key?.name === "escape") {
      controller.abort();
    }
  };
  process.stdin.on("keypress", onKeypress);
  try {
    return await run(controller.signal);
  } finally {
    process.stdin.off("keypress", onKeypress);
  }
}

function usage(): void {
  process.stdout.write(`Usage: gwoc manage

Interactive worktree manager. Arrow-key navigation to select a
worktree and an action (rename, rm, merge, push, pull, rebase, new).

Options:
  -h, --help         Show help
`);
}

type Choice = { name: string; value: string };

function buildWorktreeChoices(paths: string[]): Array<Choice | Separator> {
  let maxSlug = 0;
  let maxBranch = 0;
  let maxRemote = 0;

  const items = paths.map((p) => {
    const slug = path.basename(p);
    const branch = tryCurrentBranch(p) ?? "(detached)";
    const remote = aheadBehind(p);
    const status = fileStatus(p);
    const issues = worktreeIssues(p);
    const warn = issues.length > 0 ? " ⚠" : "";
    if (slug.length > maxSlug) maxSlug = slug.length;
    if (branch.length > maxBranch) maxBranch = branch.length;
    if (remote.length > maxRemote) maxRemote = remote.length;
    return { slug, branch, remote, status, warn, path: p };
  });

  const choices: Array<Choice | Separator> = items.map((i) => ({
    name: `${i.slug.padEnd(maxSlug + 2)}${i.branch.padEnd(maxBranch + 2)}${i.remote.padEnd(maxRemote + 2)}${i.status}${i.warn}`,
    value: i.path,
  }));

  choices.push(
    new Separator(),
    { name: "+ New worktree", value: "__new__" },
    { name: "Exit", value: "__exit__" },
  );

  return choices;
}

const actionChoices: Array<Choice | Separator> = [
  { name: "status", value: "status" },
  { name: "rename", value: "rename" },
  { name: "rm", value: "rm" },
  { name: "rm --prune (delete branch)", value: "rm-prune" },
  new Separator(),
  { name: "merge into...", value: "merge" },
  { name: "push", value: "push" },
  { name: "pull", value: "pull" },
  { name: "rebase", value: "rebase" },
  new Separator(),
  { name: "← Back", value: "__back__" },
];

export async function wtManage(args: string[]): Promise<void> {
  if (args.includes("-h") || args.includes("--help")) {
    usage();
    return;
  }

  function run(cmdArgs: string[]): void {
    process.stdout.write("\n");
    const { command, argv } = selfInvokeArgv(cmdArgs);
    spawnSync(command, argv, {
      stdio: "inherit",
      cwd: process.cwd(),
    });
    process.stdout.write("\n");
  }

  while (true) {
    const paths = liveWorktreePaths();
    let wt: string;
    try {
      wt = await withEscape((signal) =>
        select(
          { message: "Select worktree (Esc to exit):", choices: buildWorktreeChoices(paths) },
          { signal, clearPromptOnDone: true },
        ),
      );
    } catch {
      break; // Esc / Ctrl-C at top level → exit cleanly
    }

    if (wt === "__exit__") break;

    if (wt === "__new__") {
      try {
        const slug = await withEscape((signal) =>
          input({ message: "Slug:" }, { signal, clearPromptOnDone: true }),
        );
        if (!slug.trim()) continue;
        const base = await withEscape((signal) =>
          input({ message: "Base branch (blank for default):" }, { signal, clearPromptOnDone: true }),
        );
        run(base.trim() ? ["new", slug.trim(), "--branch", base.trim()] : ["new", slug.trim()]);
      } catch {
        continue;
      }
      continue;
    }

    const slug = path.basename(wt);
    let action: string;
    try {
      action = await withEscape((signal) =>
        select(
          { message: `${slug} → (Esc to go back)`, choices: actionChoices },
          { signal, clearPromptOnDone: true },
        ),
      );
    } catch {
      continue; // Esc / Ctrl-C at action menu → back to worktree list
    }

    if (action === "__back__") continue;

    try {
      switch (action) {
        case "status":
          run(["status", slug]);
          break;
        case "rename": {
          const newSlug = await withEscape((signal) =>
            input({ message: "New slug:", default: slug }, { signal, clearPromptOnDone: true }),
          );
          if (newSlug.trim() && newSlug.trim() !== slug) {
            run(["rename", slug, newSlug.trim()]);
          }
          break;
        }
        case "rm": {
          const ok = await withEscape((signal) =>
            confirm(
              { message: `Remove worktree '${slug}'?`, default: false },
              { signal, clearPromptOnDone: true },
            ),
          );
          if (ok) run(["rm", slug]);
          break;
        }
        case "rm-prune": {
          const ok = await withEscape((signal) =>
            confirm(
              { message: `Remove '${slug}' and delete branch?`, default: false },
              { signal, clearPromptOnDone: true },
            ),
          );
          if (ok) run(["rm", slug, "--prune"]);
          break;
        }
        case "merge": {
          const into = await withEscape((signal) =>
            input(
              { message: "--into branch (blank for primary):" },
              { signal, clearPromptOnDone: true },
            ),
          );
          run(into.trim() ? ["merge", slug, "--into", into.trim()] : ["merge", slug]);
          break;
        }
        case "push":
          run(["push", slug]);
          break;
        case "pull":
          run(["pull", slug]);
          break;
        case "rebase": {
          const onto = await withEscape((signal) =>
            input(
              { message: "--onto branch (blank for default):" },
              { signal, clearPromptOnDone: true },
            ),
          );
          run(onto.trim() ? ["rebase", slug, "--onto", onto.trim()] : ["rebase", slug]);
          break;
        }
      }
    } catch {
      continue; // Esc / Ctrl-C during sub-prompt → back to worktree list
    }
  }
}

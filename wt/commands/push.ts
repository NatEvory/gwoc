import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { parseArgs } from "node:util";

import { die, normalizeSlug } from "../../common.ts";
import { gitInherit, worktreePath } from "../../git.ts";
import { currentBranch } from "../helpers.ts";

function usage(): void {
  process.stdout.write(`Usage: gwoc push <slug> [--remote <name>] [--branch <name>] [--set-upstream]

Push a worktree branch to a remote.

Options:
  --remote <name>       Remote name (default: origin)
  --branch <name>       Branch to push (default: current branch in worktree)
  --set-upstream        Force updating upstream without prompting
  -h, --help            Show help

Warning: Changing upstream alters default pull/push behavior for the branch.
`);
}

function promptYesNo(question: string): boolean {
  process.stdout.write(question);
  const buffer = Buffer.alloc(1024);
  let inputText = "";
  while (!inputText.includes("\n")) {
    const bytes = fs.readSync(0, buffer, 0, buffer.length, null);
    if (bytes <= 0) {
      break;
    }
    inputText += buffer.toString("utf8", 0, bytes);
  }
  const answer = inputText.trim();
  return /^y(es)?$/i.test(answer);
}

export function wtPush(args: string[]): void {
  if (args.includes("-h") || args.includes("--help")) {
    usage();
    return;
  }

  const { values, positionals } = parseArgs({
    args,
    options: {
      remote: { type: "string", default: "origin" },
      branch: { type: "string", default: "" },
      "set-upstream": { type: "boolean", default: false },
    },
    allowPositionals: true,
  });

  const slug = normalizeSlug(positionals[0] || "");
  if (!slug) {
    die("Missing slug");
  }

  const remote = values.remote as string;
  const target = worktreePath(slug);
  if (!fs.existsSync(target)) {
    die(`Worktree not found: ${target}`);
  }

  const branchName = (values.branch as string) || currentBranch(target);
  const upstreamRes = spawnSync(
    "git",
    ["-C", target, "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"],
    { encoding: "utf8" }
  );
  const upstream = upstreamRes.status === 0 ? (upstreamRes.stdout || "").trim() : "";
  const desiredUpstream = `${remote}/${branchName}`;

  let useSetUpstream = values["set-upstream"] as boolean;
  if (upstream && upstream !== desiredUpstream && !useSetUpstream) {
    if (!process.stdin.isTTY) {
      die(`Upstream is ${upstream}. Re-run with --set-upstream to change it to ${desiredUpstream}.`);
    }
    useSetUpstream = promptYesNo(`Upstream is ${upstream}. Set to ${desiredUpstream}? [y/N] `);
  }

  const pushArgs = ["-C", target, "push"];
  if (useSetUpstream || !upstream) {
    pushArgs.push("-u");
  }
  pushArgs.push(remote, branchName);

  gitInherit(pushArgs);
}

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { die } from "./common.ts";

let gitDirOverride = process.env.GWOC_GIT_DIR || "";
let resolvedGitDir: string | null = null;

export function parseVersionPart(part: string): number {
  const match = /^\d+/.exec(part);
  if (!match) {
    return 0;
  }
  return Number.parseInt(match[0], 10);
}

export function versionGe(current: string, minimum: string): boolean {
  const currentParts = current.split(".").map(parseVersionPart);
  const minimumParts = minimum.split(".").map(parseVersionPart);
  const length = Math.max(currentParts.length, minimumParts.length);
  for (let i = 0; i < length; i += 1) {
    const a = currentParts[i] ?? 0;
    const b = minimumParts[i] ?? 0;
    if (a > b) {
      return true;
    }
    if (a < b) {
      return false;
    }
  }
  return true;
}

/** Run git and return trimmed stdout, dying on failure. */
export function gitOutput(args: string[]): string {
  const res = spawnSync("git", args, { encoding: "utf8" });
  if (res.error || res.status !== 0) {
    die(`git ${args.join(" ")} failed`);
  }
  return (res.stdout || "").trim();
}

/** Run git with inherited stdio, exiting with git's code on failure. */
export function gitInherit(args: string[]): void {
  const res = spawnSync("git", args, { stdio: "inherit" });
  if (res.error) {
    die(String(res.error));
  }
  if (res.status !== 0) {
    process.exit(res.status ?? 1);
  }
}

/** Run git silently, dying with a message on failure. */
export function runGit(args: string[]): void {
  const res = spawnSync("git", args, { stdio: "ignore" });
  if (res.error) {
    die(String(res.error));
  }
  if (res.status !== 0) {
    die(`git ${args.join(" ")} failed with status ${res.status}`);
  }
}

/** Run git and return the exit code (for existence checks). */
export function gitExitCode(args: string[]): number {
  const res = spawnSync("git", args, { stdio: "ignore" });
  return res.status ?? 1;
}

export function requireGitRelativePaths(): void {
  const out = gitOutput(["--version"]);
  const match = /git version\s+([^\s]+)/.exec(out);
  const version = match ? match[1] : "";
  if (!version) {
    die("Unable to determine git version.");
  }
  if (!versionGe(version, "2.35.0")) {
    die(`Git >= 2.35.0 required for worktree --relative-paths (found ${version}).`);
  }
}

export function abspath(target: string): string {
  return path.resolve(target);
}

export function assertHubRoot(): void {
  if (isInsideRepo(process.cwd())) {
    die(
      "Run this command from the hub root (parent of the bare repo).\nOr set GWOC_GIT_DIR / --git-dir to select the bare repo."
    );
  }
}

/** Check whether a directory (or its nearest existing ancestor) is inside a git work tree. */
export function isInsideRepo(dir: string): boolean {
  let check = dir;
  while (!fs.existsSync(check)) {
    const parent = path.dirname(check);
    if (parent === check) break;
    check = parent;
  }
  const res = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], {
    cwd: check,
    encoding: "utf8",
  });
  return res.status === 0 && (res.stdout || "").trim() === "true";
}

function resolveGitDir(): string {
  if (gitDirOverride) {
    return abspath(gitDirOverride);
  }

  assertHubRoot();

  const cwd = process.cwd();
  const entries = fs.readdirSync(cwd, { withFileTypes: true });
  const matches: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.endsWith(".git")) {
      continue;
    }
    const candidate = path.join(cwd, entry.name);
    const out = spawnSync("git", ["--git-dir", candidate, "rev-parse", "--is-bare-repository"], {
      encoding: "utf8",
    });
    if ((out.stdout || "").trim() === "true") {
      matches.push(candidate);
    }
  }

  if (matches.length === 1) {
    return abspath(matches[0]);
  }
  if (matches.length === 0) {
    die("No bare repo found in: " + cwd + "\nSet GWOC_GIT_DIR or pass --git-dir <path>.");
  }
  const listed = matches.map((p) => "- " + p).join("\n");
  die("Multiple bare repos found in: " + cwd + "\n" + listed + "\nSet GWOC_GIT_DIR or pass --git-dir <path>.");
}

export function gitDir(): string {
  if (resolvedGitDir) {
    return resolvedGitDir;
  }
  resolvedGitDir = resolveGitDir();
  return resolvedGitDir;
}

export function hubRoot(): string {
  return path.dirname(gitDir());
}

export function repoName(): string {
  const base = path.basename(gitDir());
  return base.endsWith(".git") ? base.slice(0, -4) : base;
}

export function primaryWorktree(): string {
  const res = spawnSync("git", ["--git-dir", gitDir(), "config", "--get", "gwoc.primary"], { encoding: "utf8" });
  const configured = (res.stdout || "").trim();
  if (configured) {
    return path.resolve(hubRoot(), configured);
  }
  return path.join(hubRoot(), repoName());
}

export function defaultBranch(): string {
  const ref = spawnSync("git", ["--git-dir", gitDir(), "symbolic-ref", "-q", "HEAD"], { encoding: "utf8" });
  const refOut = (ref.stdout || "").trim();
  if (refOut) {
    return refOut.replace(/^refs\/heads\//, "");
  }
  if (gitExitCode(["--git-dir", gitDir(), "show-ref", "--verify", "--quiet", "refs/heads/main"]) === 0) {
    return "main";
  }
  if (gitExitCode(["--git-dir", gitDir(), "show-ref", "--verify", "--quiet", "refs/heads/master"]) === 0) {
    return "master";
  }
  die("Unable to determine default branch. Set the bare repo HEAD or pass --branch <name>.");
}

export function worktreePath(slug: string): string {
  return path.join(hubRoot(), slug);
}

export function parseGitDirOverride(args: string[]): string[] {
  if (args[0] === "--git-dir") {
    const value = args[1];
    if (!value || value.startsWith("-")) {
      die("Missing value for --git-dir");
    }
    gitDirOverride = value;
    resolvedGitDir = null;
    return args.slice(2);
  }
  if (args[0]?.startsWith("--git-dir=")) {
    gitDirOverride = args[0].slice("--git-dir=".length);
    resolvedGitDir = null;
    return args.slice(1);
  }
  return args;
}

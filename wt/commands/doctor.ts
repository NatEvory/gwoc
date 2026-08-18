import path from "node:path";
import { spawnSync } from "node:child_process";
import { parseArgs } from "node:util";
import { confirm } from "@inquirer/prompts";

import { selfInvokeArgv } from "../../common.ts";
import { gitDir, runGit } from "../../git.ts";
import {
  type Issue,
  liveWorktreePaths,
  missingPrimary,
  orphanedBranches,
  prunableEntries,
  worktreeIssues,
} from "../checks.ts";

function usage(): void {
  process.stdout.write(`Usage: gwoc doctor [--merged] [--fix]

Run health checks on the hub. Reports per-worktree issues and hub-wide
problems. Exits non-zero if any issues are found.

Per-worktree checks:
  - slug/branch mismatch (directory name \u2260 checked-out branch)
  - detached HEAD
  - upstream gone (remote branch deleted)

Hub-wide checks:
  - orphaned branches (no worktree, not the default branch)
  - prunable worktrees (admin metadata points at missing directory)
  - missing primary worktree

Options:
  --merged           Also list orphaned branches already merged into default
                     (by default only unmerged orphans are shown as warnings)
  --fix              Interactively fix issues that have safe fixes
  -h, --help         Show help
`);
}

type Finding =
  | { kind: "worktree-issue"; path: string; issue: Issue }
  | { kind: "prunable"; path: string; reason: string }
  | { kind: "orphan-merged"; branch: string }
  | { kind: "orphan-unmerged"; branch: string }
  | { kind: "missing-primary"; path: string };

interface CollectResult {
  findings: Finding[];
  mergedOrphans: string[];
}

function collectFindings(): CollectResult {
  const findings: Finding[] = [];

  for (const p of liveWorktreePaths()) {
    for (const issue of worktreeIssues(p)) {
      findings.push({ kind: "worktree-issue", path: p, issue });
    }
  }

  for (const p of prunableEntries()) {
    findings.push({ kind: "prunable", path: p.path, reason: p.reason });
  }

  const { unmerged, merged } = orphanedBranches();
  for (const b of unmerged) {
    findings.push({ kind: "orphan-unmerged", branch: b });
  }
  // `merged` orphans are tracked separately — not counted as "issues" unless
  // --merged is passed, but they're available for --fix.
  for (const b of merged) {
    findings.push({ kind: "orphan-merged", branch: b });
  }

  const missing = missingPrimary();
  if (missing) {
    findings.push({ kind: "missing-primary", path: missing });
  }

  return { findings, mergedOrphans: merged };
}

function countIssues(findings: Finding[]): number {
  // Merged orphans don't count as issues by default.
  return findings.filter((f) => f.kind !== "orphan-merged").length;
}

function renderFindings(findings: Finding[], showMerged: boolean): void {
  const section = (title: string) => process.stdout.write(`\n${title}\n`);

  const worktreeIssues = findings.filter((f) => f.kind === "worktree-issue");
  if (worktreeIssues.length > 0) {
    section("Worktree issues:");
    let currentPath = "";
    for (const f of worktreeIssues) {
      if (f.kind !== "worktree-issue") continue;
      if (f.path !== currentPath) {
        process.stdout.write(`  ${f.path}\n`);
        currentPath = f.path;
      }
      process.stdout.write(`    - ${f.issue.message}\n`);
    }
  }

  const prunable = findings.filter((f) => f.kind === "prunable");
  if (prunable.length > 0) {
    section("Prunable worktree entries (run `gwoc prune`):");
    for (const f of prunable) {
      if (f.kind !== "prunable") continue;
      process.stdout.write(`  ${f.path} (${f.reason})\n`);
    }
  }

  const unmerged = findings.filter((f) => f.kind === "orphan-unmerged");
  if (unmerged.length > 0) {
    section("Orphaned branches (no worktree, not merged into default):");
    for (const f of unmerged) {
      if (f.kind !== "orphan-unmerged") continue;
      process.stdout.write(`  ${f.branch}\n`);
    }
  }

  if (showMerged) {
    const merged = findings.filter((f) => f.kind === "orphan-merged");
    if (merged.length > 0) {
      section("Orphaned branches already merged into default (safe to delete):");
      for (const f of merged) {
        if (f.kind !== "orphan-merged") continue;
        process.stdout.write(`  ${f.branch}\n`);
      }
    }
  }

  const missing = findings.find((f) => f.kind === "missing-primary");
  if (missing && missing.kind === "missing-primary") {
    section("Missing primary worktree:");
    process.stdout.write(`  ${missing.path} (configured as gwoc.primary but does not exist)\n`);
  }
}

// ---------- fix mode ----------

async function fixPrunable(paths: string[]): Promise<number> {
  if (paths.length === 0) return 0;
  process.stdout.write(`\nPrunable worktree entries: ${paths.length}\n`);
  for (const p of paths) process.stdout.write(`  - ${p}\n`);
  const ok = await confirm({ message: "Run `git worktree prune`?", default: true });
  if (!ok) return 0;
  runGit(["--git-dir", gitDir(), "worktree", "prune"]);
  process.stdout.write(`Pruned ${paths.length} entr${paths.length === 1 ? "y" : "ies"}.\n`);
  return paths.length;
}

async function fixMergedOrphans(branches: string[]): Promise<number> {
  if (branches.length === 0) return 0;
  process.stdout.write(`\nMerged orphaned branches: ${branches.length}\n`);
  for (const b of branches) process.stdout.write(`  - ${b}\n`);
  const ok = await confirm({
    message: `Delete all ${branches.length} merged branch${branches.length === 1 ? "" : "es"}?`,
    default: true,
  });
  if (!ok) return 0;
  let deleted = 0;
  for (const b of branches) {
    const res = spawnSync("git", ["--git-dir", gitDir(), "branch", "-d", b], { stdio: "inherit" });
    if (res.status === 0) deleted++;
  }
  process.stdout.write(`Deleted ${deleted} branch${deleted === 1 ? "" : "es"}.\n`);
  return deleted;
}

async function fixUnmergedOrphans(branches: string[]): Promise<number> {
  if (branches.length === 0) return 0;
  process.stdout.write(`\nUnmerged orphaned branches: ${branches.length} (destructive — per-branch confirmation)\n`);
  let deleted = 0;
  for (const b of branches) {
    const ok = await confirm({
      message: `FORCE-delete unmerged branch '${b}'? This discards any commits not reachable from default.`,
      default: false,
    });
    if (!ok) continue;
    const res = spawnSync("git", ["--git-dir", gitDir(), "branch", "-D", b], { stdio: "inherit" });
    if (res.status === 0) deleted++;
  }
  return deleted;
}

async function fixMismatches(mismatches: Array<{ path: string; issue: Issue }>): Promise<number> {
  if (mismatches.length === 0) return 0;
  process.stdout.write(`\nSlug/branch mismatches: ${mismatches.length}\n`);
  let fixed = 0;
  for (const m of mismatches) {
    // Issue message format: "Directory is '<dir>' but branch is '<branch>' — ..."
    const match = /Directory is '([^']+)' but branch is '([^']+)'/.exec(m.issue.message);
    if (!match) continue;
    const dir = match[1];
    const branch = match[2];
    const ok = await confirm({
      message: `Rename worktree directory '${dir}' → '${branch}' to match the branch?`,
      default: true,
    });
    if (!ok) continue;
    const { command, argv } = selfInvokeArgv(["rename", dir, branch]);
    const res = spawnSync(command, argv, { stdio: "inherit" });
    if (res.status === 0) fixed++;
  }
  return fixed;
}

async function fixUpstreamGone(worktrees: string[]): Promise<number> {
  if (worktrees.length === 0) return 0;
  process.stdout.write(`\nWorktrees with upstream gone: ${worktrees.length}\n`);
  let fixed = 0;
  for (const wt of worktrees) {
    const ok = await confirm({
      message: `Unset upstream for worktree '${path.basename(wt)}'? (branch tracks a deleted remote ref)`,
      default: true,
    });
    if (!ok) continue;
    const res = spawnSync("git", ["-C", wt, "branch", "--unset-upstream"], { stdio: "inherit" });
    if (res.status === 0) fixed++;
  }
  return fixed;
}

async function runFixMode(findings: Finding[]): Promise<void> {
  const prunable = findings.filter((f) => f.kind === "prunable").map((f) => (f as { path: string }).path);
  const mergedOrphans = findings
    .filter((f) => f.kind === "orphan-merged")
    .map((f) => (f as { branch: string }).branch);
  const unmergedOrphans = findings
    .filter((f) => f.kind === "orphan-unmerged")
    .map((f) => (f as { branch: string }).branch);
  const mismatches = findings
    .filter((f) => f.kind === "worktree-issue" && f.issue.code === "slug-branch-mismatch")
    .map((f) => ({ path: (f as { path: string }).path, issue: (f as { issue: Issue }).issue }));
  const upstreamGone = findings
    .filter((f) => f.kind === "worktree-issue" && f.issue.code === "upstream-gone")
    .map((f) => (f as { path: string }).path);
  const detached = findings.filter((f) => f.kind === "worktree-issue" && f.issue.code === "detached-head");
  const missingPrimary = findings.find((f) => f.kind === "missing-primary");

  if (
    prunable.length === 0 &&
    mergedOrphans.length === 0 &&
    unmergedOrphans.length === 0 &&
    mismatches.length === 0 &&
    upstreamGone.length === 0
  ) {
    if (detached.length === 0 && !missingPrimary) {
      return; // nothing to offer
    }
  }

  process.stdout.write("\n--- Fix mode ---\n");
  process.stdout.write("You'll be prompted for each fixable issue. Ctrl-C to bail.\n");

  let applied = 0;
  try {
    applied += await fixPrunable(prunable);
    applied += await fixMismatches(mismatches);
    applied += await fixUpstreamGone(upstreamGone);
    applied += await fixMergedOrphans(mergedOrphans);
    applied += await fixUnmergedOrphans(unmergedOrphans);
  } catch {
    // Ctrl-C during prompt — just stop gracefully.
    process.stdout.write("\nFix mode cancelled.\n");
    return;
  }

  // Un-fixable: just print hints.
  for (const d of detached) {
    if (d.kind !== "worktree-issue") continue;
    process.stdout.write(`\nDetached HEAD at ${d.path} — no automatic fix. Run 'git -C <wt> checkout <branch>'.\n`);
  }
  if (missingPrimary && missingPrimary.kind === "missing-primary") {
    process.stdout.write(
      `\nMissing primary worktree at ${missingPrimary.path} — no automatic fix. Re-create with 'git --git-dir=<bare> worktree add'.\n`,
    );
  }

  process.stdout.write(`\n${applied} fix${applied === 1 ? "" : "es"} applied.\n`);
}

// ---------- entry point ----------

export async function wtDoctor(args: string[]): Promise<void> {
  if (args.includes("-h") || args.includes("--help")) {
    usage();
    return;
  }

  const { values } = parseArgs({
    args,
    options: {
      merged: { type: "boolean", default: false },
      fix: { type: "boolean", default: false },
    },
    allowPositionals: true,
  });

  const { findings } = collectFindings();
  renderFindings(findings, Boolean(values.merged) || Boolean(values.fix));

  const issueCount = countIssues(findings);

  if (values.fix) {
    await runFixMode(findings);
    return; // --fix always exits 0; follow-up `gwoc doctor` re-verifies
  }

  if (issueCount === 0) {
    process.stdout.write("All checks passed.\n");
    return;
  }

  process.stdout.write(`\n${issueCount} issue${issueCount === 1 ? "" : "s"} found.\n`);
  process.exit(1);
}

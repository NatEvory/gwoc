import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";

const gwoc = path.resolve("gwoc.ts");
let tmpDir: string;

// Tests spawn gwoc, which runs `git commit`/`git rebase` — supply an identity
// via the environment so the suite passes on machines (and CI runners) with no
// user-level git config, and doesn't depend on the developer's own.
// Note: these mutations only reach children spawned with an explicit env that
// spreads process.env (the run helpers below). Bare spawnSync(git ...) calls
// don't see them under Bun, so direct test commits pass -c user.* flags.
process.env.GIT_AUTHOR_NAME = "gwoc-test";
process.env.GIT_AUTHOR_EMAIL = "gwoc-test@example.invalid";
process.env.GIT_COMMITTER_NAME = "gwoc-test";
process.env.GIT_COMMITTER_EMAIL = "gwoc-test@example.invalid";

function run(args: string[], cwd?: string) {
  const res = spawnSync("bun", [gwoc, ...args], {
    cwd: cwd ?? tmpDir,
    encoding: "utf8",
    env: { ...process.env, GWOC_GIT_DIR: "" },
  });
  return {
    stdout: (res.stdout || "").trim(),
    stderr: (res.stderr || "").trim(),
    status: res.status ?? 1,
  };
}

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gwoc-test-"));
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("workflow", () => {
  test("init creates hub root with bare repo and primary worktree inside", () => {
    const res = run(["init", "myproject"]);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("Hub root:");
    expect(res.stdout).toContain("Bare repo:");
    expect(res.stdout).toContain("Primary worktree:");
    const root = path.join(tmpDir, "myproject");
    expect(fs.existsSync(path.join(root, "myproject.git"))).toBe(true);
    expect(fs.existsSync(path.join(root, "main"))).toBe(true);
  });

  test("init --primary overrides default worktree name", () => {
    const parent = path.join(tmpDir, "custom-hub");
    fs.mkdirSync(parent);
    const res = run(["init", "repo", "--primary", "dev"], parent);
    expect(res.status).toBe(0);
    const root = path.join(parent, "repo");
    expect(fs.existsSync(path.join(root, "repo.git"))).toBe(true);
    expect(fs.existsSync(path.join(root, "dev"))).toBe(true);
    // default "main" dir should NOT exist — primary is "dev"
    expect(fs.existsSync(path.join(root, "main"))).toBe(false);
  });

  test("init --flat places bare repo and worktree directly in --dir", () => {
    const flat = path.join(tmpDir, "flat-hub");
    fs.mkdirSync(flat);
    const res = run(["init", "flatproj", "--flat"], flat);
    expect(res.status).toBe(0);
    expect(fs.existsSync(path.join(flat, "flatproj.git"))).toBe(true);
    expect(fs.existsSync(path.join(flat, "main"))).toBe(true);
    expect(fs.existsSync(path.join(flat, "flatproj"))).toBe(false);
  });

  test("init reuses an existing empty directory as hub root", () => {
    const parent = path.join(tmpDir, "pre-made");
    fs.mkdirSync(path.join(parent, "empty"), { recursive: true });
    const res = run(["init", "empty"], parent);
    expect(res.status).toBe(0);
    expect(fs.existsSync(path.join(parent, "empty", "empty.git"))).toBe(true);
  });

  test("init refuses a non-empty hub root directory", () => {
    const parent = path.join(tmpDir, "occupied");
    fs.mkdirSync(path.join(parent, "taken"), { recursive: true });
    fs.writeFileSync(path.join(parent, "taken", "file.txt"), "x\n");
    const res = run(["init", "taken"], parent);
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain("already exists");
  });

  // remaining tests run inside the myproject hub root
  const hub = () => path.join(tmpDir, "myproject");

  test("list shows worktrees", () => {
    const res = run(["list"], hub());
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("myproject");
  });

  test("new creates a worktree and branch", () => {
    const res = run(["new", "feature-a"], hub());
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("feature-a");
    expect(fs.existsSync(path.join(hub(), "feature-a"))).toBe(true);
  });

  test("status shows worktree info", () => {
    const res = run(["status", "feature-a"], hub());
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("Branch:       feature-a");
    expect(res.stdout).toContain("Status:       clean");
    expect(res.stdout).toContain("Last commit:");
  });

  test("status with no slug shows all worktrees", () => {
    const res = run(["status"], hub());
    expect(res.status).toBe(0);
    // should contain both primary and feature-a
    expect(res.stdout).toContain("Branch:       main");
    expect(res.stdout).toContain("Branch:       feature-a");
  });

  test("status shows dirty state", () => {
    const wtPath = path.join(hub(), "feature-a");
    fs.writeFileSync(path.join(wtPath, "test.txt"), "hello\n");
    const res = run(["status", "feature-a"], hub());
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("untracked");
  });

  test("new --branch creates worktree from another branch", () => {
    const res = run(["new", "feature-b", "--branch", "feature-a"], hub());
    expect(res.status).toBe(0);
    expect(fs.existsSync(path.join(hub(), "feature-b"))).toBe(true);
  });

  test("merge merges branch into primary", () => {
    // commit something on feature-b so there's something to merge
    const wtPath = path.join(hub(), "feature-b");
    fs.writeFileSync(path.join(wtPath, "merged.txt"), "merged\n");
    spawnSync("git", ["-C", wtPath, "add", "merged.txt"], { stdio: "ignore" });
    spawnSync("git", ["-C", wtPath, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-m", "add merged.txt"], { stdio: "ignore" });

    const res = run(["merge", "feature-b"], hub());
    expect(res.status).toBe(0);
    // file should now exist in primary worktree
    expect(fs.existsSync(path.join(hub(), "main", "merged.txt"))).toBe(true);
  });

  test("rm removes worktree", () => {
    const res = run(["rm", "feature-b"], hub());
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("Removed:");
    expect(fs.existsSync(path.join(hub(), "feature-b"))).toBe(false);
  });

  test("rm handles trailing slash from tab completion", () => {
    run(["new", "slash-test"], hub());
    const res = run(["rm", "slash-test/", "--prune"], hub());
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("Deleted branch: slash-test");
    expect(fs.existsSync(path.join(hub(), "slash-test"))).toBe(false);
  });

  test("rm --prune removes worktree and branch", () => {
    // feature-a has an uncommitted file, need --force
    const res = run(["rm", "feature-a", "--prune", "--force"], hub());
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("Removed:");
    expect(res.stdout).toContain("Deleted branch: feature-a");
    expect(fs.existsSync(path.join(hub(), "feature-a"))).toBe(false);

    // verify branch is gone
    const branches = spawnSync("git", ["--git-dir", path.join(hub(), "myproject.git"), "branch"], { encoding: "utf8" });
    expect(branches.stdout).not.toContain("feature-a");
  });

  test("root prints hub root", () => {
    const res = run(["root"], hub());
    expect(res.status).toBe(0);
    expect(res.stdout).toBe(hub());
  });

  test("dir prints bare repo path", () => {
    const res = run(["dir"], hub());
    expect(res.status).toBe(0);
    expect(res.stdout).toBe(path.join(hub(), "myproject.git"));
  });

  test("primary prints primary worktree", () => {
    const res = run(["primary"], hub());
    expect(res.status).toBe(0);
    expect(res.stdout).toBe(path.join(hub(), "main"));
  });

  test("primary reads gwoc.primary config", () => {
    const hub2 = path.join(tmpDir, "custom-hub", "repo");
    const res = run(["primary"], hub2);
    expect(res.status).toBe(0);
    expect(res.stdout).toBe(path.join(hub2, "dev"));
  });

  test("default prints default branch", () => {
    const res = run(["default"], hub());
    expect(res.status).toBe(0);
    expect(res.stdout).toBe("main");
  });

  test("path prints worktree path for slug", () => {
    const res = run(["path", "some-slug"], hub());
    expect(res.status).toBe(0);
    expect(res.stdout).toBe(path.join(hub(), "some-slug"));
  });

  test("unknown command fails", () => {
    const res = run(["nonexistent"], hub());
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain("Unknown command");
  });

  test("manage --help prints usage without hanging", () => {
    const res = run(["manage", "--help"], hub());
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("Interactive worktree manager");
  });

  test("post-create hook runs on gwoc new", () => {
    // set up hook in primary worktree (it'll be inherited by new worktrees)
    const primary = path.join(hub(), "main");
    const hookDir = path.join(primary, ".gwoc", "hooks");
    fs.mkdirSync(hookDir, { recursive: true });
    fs.writeFileSync(
      path.join(hookDir, "post-create"),
      '#!/usr/bin/env bash\ntouch "$GWOC_WORKTREE/hook-ran"\n'
    );
    fs.chmodSync(path.join(hookDir, "post-create"), 0o755);
    // commit so the hook is available in new worktrees
    spawnSync("git", ["-C", primary, "add", ".gwoc"], { stdio: "ignore" });
    spawnSync("git", ["-C", primary, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-m", "add post-create hook"], { stdio: "ignore" });

    const res = run(["new", "hook-test"], hub());
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("Running post-create hook");
    expect(fs.existsSync(path.join(hub(), "hook-test", "hook-ran"))).toBe(true);
  });

  test("--no-hooks skips post-create hook", () => {
    const res = run(["new", "hook-skip", "--no-hooks"], hub());
    expect(res.status).toBe(0);
    expect(res.stdout).not.toContain("Running post-create hook");
    expect(fs.existsSync(path.join(hub(), "hook-skip", "hook-ran"))).toBe(false);
  });
});

describe("multi-level hooks", () => {
  let xdgDir: string;
  let workDir: string;
  let sourceBare: string;

  function runEnv(args: string[], cwd: string, extraEnv: Record<string, string> = {}) {
    const res = spawnSync("bun", [gwoc, ...args], {
      cwd,
      encoding: "utf8",
      env: { ...process.env, GWOC_GIT_DIR: "", XDG_CONFIG_HOME: xdgDir, ...extraEnv },
    });
    return {
      stdout: (res.stdout || "").trim(),
      stderr: (res.stderr || "").trim(),
      status: res.status ?? 1,
    };
  }

  function writeUserHook(name: string, body: string): void {
    const dir = path.join(xdgDir, "gwoc", "hooks");
    fs.mkdirSync(dir, { recursive: true });
    const p = path.join(dir, name);
    fs.writeFileSync(p, body);
    fs.chmodSync(p, 0o755);
  }

  function clearUserHooks(): void {
    const dir = path.join(xdgDir, "gwoc", "hooks");
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  beforeAll(() => {
    xdgDir = fs.mkdtempSync(path.join(os.tmpdir(), "gwoc-xdg-"));
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), "gwoc-hookwork-"));

    // Build a local bare repo to use as a clone source (no network).
    const sourceWork = fs.mkdtempSync(path.join(os.tmpdir(), "gwoc-hooksrc-"));
    spawnSync("git", ["init", "-b", "main", sourceWork], { stdio: "ignore" });
    fs.writeFileSync(path.join(sourceWork, "README.md"), "hi\n");
    spawnSync("git", ["-C", sourceWork, "add", "."], { stdio: "ignore" });
    spawnSync("git", ["-C", sourceWork, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-m", "init"], { stdio: "ignore" });
    sourceBare = path.join(workDir, "source.git");
    spawnSync("git", ["clone", "--bare", sourceWork, sourceBare], { stdio: "ignore" });
    fs.rmSync(sourceWork, { recursive: true, force: true });
  });

  afterAll(() => {
    fs.rmSync(xdgDir, { recursive: true, force: true });
    fs.rmSync(workDir, { recursive: true, force: true });
  });

  test("post-init user-level hook runs on gwoc init", () => {
    clearUserHooks();
    writeUserHook(
      "post-init",
      '#!/usr/bin/env bash\ntouch "$GWOC_HUB_ROOT/init-ran"\necho "branch=$GWOC_BRANCH name=$GWOC_NAME"\n',
    );
    const dir = path.join(workDir, "init-user");
    fs.mkdirSync(dir);
    const res = runEnv(["init", "proj"], dir);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("Running post-init hook (user)");
    expect(res.stdout).toContain("branch=main name=proj");
    expect(fs.existsSync(path.join(dir, "proj", "init-ran"))).toBe(true);
  });

  test("post-clone user-level hook runs on gwoc clone", () => {
    clearUserHooks();
    writeUserHook(
      "post-clone",
      '#!/usr/bin/env bash\ntouch "$GWOC_HUB_ROOT/clone-ran"\necho "url=$GWOC_REMOTE_URL"\n',
    );
    const dir = path.join(workDir, "clone-user");
    fs.mkdirSync(dir);
    const res = runEnv(["clone", sourceBare, "cloned"], dir);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("Running post-clone hook (user)");
    expect(res.stdout).toContain(`url=${sourceBare}`);
    expect(fs.existsSync(path.join(dir, "cloned", "clone-ran"))).toBe(true);
  });

  test("hub-level post-create hook runs without being committed", () => {
    clearUserHooks();
    const dir = path.join(workDir, "hub-create");
    fs.mkdirSync(dir);
    // set up a fresh hub
    expect(runEnv(["init", "h"], dir).status).toBe(0);
    const root = path.join(dir, "h");
    // drop a hub-level hook (NOT in the worktree, NOT committed)
    const hubHookDir = path.join(root, ".gwoc", "hooks");
    fs.mkdirSync(hubHookDir, { recursive: true });
    fs.writeFileSync(
      path.join(hubHookDir, "post-create"),
      '#!/usr/bin/env bash\ntouch "$GWOC_WORKTREE/hub-hook-ran"\n',
    );
    fs.chmodSync(path.join(hubHookDir, "post-create"), 0o755);

    const res = runEnv(["new", "feat"], root);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("Running post-create hook (hub)");
    expect(fs.existsSync(path.join(root, "feat", "hub-hook-ran"))).toBe(true);
  });

  test("post-create composes user + hub + worktree in order", () => {
    clearUserHooks();
    writeUserHook(
      "post-create",
      '#!/usr/bin/env bash\ntouch "$GWOC_WORKTREE/user-ran"\n',
    );
    const dir = path.join(workDir, "compose");
    fs.mkdirSync(dir);
    expect(runEnv(["init", "c"], dir).status).toBe(0);
    const root = path.join(dir, "c");

    // hub-level hook
    const hubHookDir = path.join(root, ".gwoc", "hooks");
    fs.mkdirSync(hubHookDir, { recursive: true });
    fs.writeFileSync(
      path.join(hubHookDir, "post-create"),
      '#!/usr/bin/env bash\ntouch "$GWOC_WORKTREE/hub-ran"\n',
    );
    fs.chmodSync(path.join(hubHookDir, "post-create"), 0o755);

    // worktree-level (committed in primary so new worktrees inherit it)
    const primary = path.join(root, "main");
    const wtHookDir = path.join(primary, ".gwoc", "hooks");
    fs.mkdirSync(wtHookDir, { recursive: true });
    fs.writeFileSync(
      path.join(wtHookDir, "post-create"),
      '#!/usr/bin/env bash\ntouch "$GWOC_WORKTREE/wt-ran"\n',
    );
    fs.chmodSync(path.join(wtHookDir, "post-create"), 0o755);
    spawnSync("git", ["-C", primary, "add", ".gwoc"], { stdio: "ignore" });
    spawnSync("git", ["-C", primary, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-m", "wt hook"], { stdio: "ignore" });

    const res = runEnv(["new", "compose-test"], root);
    expect(res.status).toBe(0);

    const target = path.join(root, "compose-test");
    expect(fs.existsSync(path.join(target, "user-ran"))).toBe(true);
    expect(fs.existsSync(path.join(target, "hub-ran"))).toBe(true);
    expect(fs.existsSync(path.join(target, "wt-ran"))).toBe(true);

    // order check: "(user)" before "(hub)" before "(worktree)"
    const idxUser = res.stdout.indexOf("(user)");
    const idxHub = res.stdout.indexOf("(hub)");
    const idxWt = res.stdout.indexOf("(worktree)");
    expect(idxUser).toBeGreaterThanOrEqual(0);
    expect(idxHub).toBeGreaterThan(idxUser);
    expect(idxWt).toBeGreaterThan(idxHub);
  });

  test("init --no-hooks skips post-init", () => {
    clearUserHooks();
    writeUserHook("post-init", '#!/usr/bin/env bash\ntouch "$GWOC_HUB_ROOT/init-ran"\n');
    const dir = path.join(workDir, "init-skip");
    fs.mkdirSync(dir);
    const res = runEnv(["init", "p", "--no-hooks"], dir);
    expect(res.status).toBe(0);
    expect(res.stdout).not.toContain("Running post-init hook");
    expect(fs.existsSync(path.join(dir, "p", "init-ran"))).toBe(false);
  });

  test("clone --no-hooks skips post-clone", () => {
    clearUserHooks();
    writeUserHook("post-clone", '#!/usr/bin/env bash\ntouch "$GWOC_HUB_ROOT/clone-ran"\n');
    const dir = path.join(workDir, "clone-skip");
    fs.mkdirSync(dir);
    const res = runEnv(["clone", sourceBare, "cl", "--no-hooks"], dir);
    expect(res.status).toBe(0);
    expect(res.stdout).not.toContain("Running post-clone hook");
    expect(fs.existsSync(path.join(dir, "cl", "clone-ran"))).toBe(false);
  });

  test("failing hook warns but does not block later hooks", () => {
    clearUserHooks();
    writeUserHook("post-init", '#!/usr/bin/env bash\nexit 1\n');
    const dir = path.join(workDir, "fail");
    fs.mkdirSync(dir);
    // hub-level hook, dropped pre-init. Use --flat so `dir` itself is the hub
    // root (the default nested root must not exist before init).
    fs.mkdirSync(path.join(dir, ".gwoc", "hooks"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, ".gwoc", "hooks", "post-init"),
      '#!/usr/bin/env bash\ntouch "$GWOC_HUB_ROOT/hub-after-fail"\n',
    );
    fs.chmodSync(path.join(dir, ".gwoc", "hooks", "post-init"), 0o755);

    const res = runEnv(["init", "f", "--flat", "--force"], dir);
    expect(res.status).toBe(0);
    expect(res.stderr).toContain("post-init hook (user) exited with status 1");
    // hub-level hook must have run after the failing user-level hook
    expect(fs.existsSync(path.join(dir, "hub-after-fail"))).toBe(true);
  });
});

describe("rename", () => {
  let parent: string;
  let hub: string;

  function runHub(args: string[], cwd?: string) {
    const res = spawnSync("bun", [gwoc, ...args], {
      cwd: cwd ?? hub,
      encoding: "utf8",
      env: { ...process.env, GWOC_GIT_DIR: "" },
    });
    return {
      stdout: (res.stdout || "").trim(),
      stderr: (res.stderr || "").trim(),
      status: res.status ?? 1,
    };
  }

  beforeAll(() => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), "gwoc-rename-"));
    hub = path.join(parent, "proj");
    expect(runHub(["init", "proj"], parent).status).toBe(0);
  });

  afterAll(() => {
    fs.rmSync(parent, { recursive: true, force: true });
  });

  test("renames directory and branch together", () => {
    expect(runHub(["new", "feat-a"]).status).toBe(0);
    const res = runHub(["rename", "feat-a", "feat-b"]);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("Renamed:");
    expect(res.stdout).toContain("Branch:");

    expect(fs.existsSync(path.join(hub, "feat-a"))).toBe(false);
    expect(fs.existsSync(path.join(hub, "feat-b"))).toBe(true);

    // branch ref should now be feat-b, not feat-a
    const branches = spawnSync("git", ["--git-dir", path.join(hub, "proj.git"), "branch"], { encoding: "utf8" });
    expect(branches.stdout).toContain("feat-b");
    expect(branches.stdout).not.toMatch(/\bfeat-a\b/);

    // worktree's HEAD should report feat-b
    const head = spawnSync("git", ["-C", path.join(hub, "feat-b"), "rev-parse", "--abbrev-ref", "HEAD"], { encoding: "utf8" });
    expect((head.stdout || "").trim()).toBe("feat-b");
  });

  test("refuses when new slug directory exists", () => {
    expect(runHub(["new", "src1"]).status).toBe(0);
    expect(runHub(["new", "src2"]).status).toBe(0);
    const res = runHub(["rename", "src1", "src2"]);
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain("already exists");
    // both must still be intact
    expect(fs.existsSync(path.join(hub, "src1"))).toBe(true);
    expect(fs.existsSync(path.join(hub, "src2"))).toBe(true);
  });

  test("refuses on dirty worktree without --force", () => {
    expect(runHub(["new", "dirty"]).status).toBe(0);
    fs.writeFileSync(path.join(hub, "dirty", "scratch.txt"), "x\n");
    const res = runHub(["rename", "dirty", "tidy"]);
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain("uncommitted changes");
    expect(fs.existsSync(path.join(hub, "dirty"))).toBe(true);
    expect(fs.existsSync(path.join(hub, "tidy"))).toBe(false);
  });

  test("--force allows rename with dirty worktree", () => {
    const res = runHub(["rename", "dirty", "tidy", "--force"]);
    expect(res.status).toBe(0);
    expect(fs.existsSync(path.join(hub, "dirty"))).toBe(false);
    expect(fs.existsSync(path.join(hub, "tidy", "scratch.txt"))).toBe(true);
  });

  test("refuses when new slug equals old slug", () => {
    expect(runHub(["new", "same"]).status).toBe(0);
    const res = runHub(["rename", "same", "same"]);
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain("same");
  });

  test("refuses when new branch name already exists", () => {
    expect(runHub(["new", "branch-a"]).status).toBe(0);
    expect(runHub(["new", "branch-b"]).status).toBe(0);
    // remove branch-b worktree but keep branch
    expect(runHub(["rm", "branch-b"]).status).toBe(0);
    const res = runHub(["rename", "branch-a", "branch-b"]);
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain("Branch already exists");
    expect(fs.existsSync(path.join(hub, "branch-a"))).toBe(true);
  });

  test("refuses on detached HEAD", () => {
    expect(runHub(["new", "det"]).status).toBe(0);
    // detach HEAD in the worktree
    spawnSync("git", ["-C", path.join(hub, "det"), "checkout", "--detach"], { stdio: "ignore" });
    const res = runHub(["rename", "det", "attached"]);
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain("detached HEAD");
  });
});

describe("diagnostics", () => {
  let parent: string;
  let hub: string;

  function runHub(args: string[], cwd?: string) {
    const res = spawnSync("bun", [gwoc, ...args], {
      cwd: cwd ?? hub,
      encoding: "utf8",
      env: { ...process.env, GWOC_GIT_DIR: "" },
    });
    return {
      stdout: (res.stdout || "").trim(),
      stderr: (res.stderr || "").trim(),
      status: res.status ?? 1,
    };
  }

  function commitIn(wt: string, file: string, body: string, msg: string) {
    fs.writeFileSync(path.join(wt, file), body);
    spawnSync("git", ["-C", wt, "add", file], { stdio: "ignore" });
    spawnSync(
      "git",
      ["-C", wt, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-m", msg],
      { stdio: "ignore" },
    );
  }

  beforeAll(() => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), "gwoc-doctor-"));
    hub = path.join(parent, "proj");
    expect(runHub(["init", "proj"], parent).status).toBe(0);
  });

  afterAll(() => {
    fs.rmSync(parent, { recursive: true, force: true });
  });

  test("status tolerates detached HEAD instead of crashing", () => {
    expect(runHub(["new", "det"]).status).toBe(0);
    spawnSync("git", ["-C", path.join(hub, "det"), "checkout", "--detach"], { stdio: "ignore" });
    const res = runHub(["status"]);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("(detached HEAD)");
    expect(res.stdout).toContain("Detached HEAD");
  });

  test("status flags slug/branch mismatch", () => {
    expect(runHub(["new", "mm"]).status).toBe(0);
    spawnSync("git", ["-C", path.join(hub, "mm"), "branch", "-m", "renamed"], { stdio: "ignore" });
    const res = runHub(["status", "mm"]);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("Directory is 'mm' but branch is 'renamed'");
  });

  test("doctor reports per-worktree issues", () => {
    // by now: det (detached), mm (mismatch), primary main — so doctor should fail
    const res = runHub(["doctor"]);
    expect(res.status).not.toBe(0);
    expect(res.stdout).toContain("Worktree issues:");
    expect(res.stdout).toContain("Detached HEAD");
    expect(res.stdout).toContain("Directory is 'mm' but branch is 'renamed'");
    expect(res.stdout).toContain("issues found");
  });

  test("doctor reports unmerged orphaned branch", () => {
    // Create a branch in the bare repo with a divergent commit, no worktree.
    // Easiest: use `gwoc new` then commit, then rm the worktree (branch stays).
    expect(runHub(["new", "orph"]).status).toBe(0);
    commitIn(path.join(hub, "orph"), "orph.txt", "x\n", "orphan commit");
    expect(runHub(["rm", "orph"]).status).toBe(0);
    // now "orph" branch exists in bare repo with a commit not in main

    const res = runHub(["doctor"]);
    expect(res.status).not.toBe(0);
    expect(res.stdout).toContain("Orphaned branches");
    expect(res.stdout).toContain("orph");
  });

  test("doctor --merged lists branches merged into default", () => {
    // Create a branch at the same commit as main (already merged)
    spawnSync(
      "git",
      ["--git-dir", path.join(hub, "proj.git"), "branch", "same-as-main", "main"],
      { stdio: "ignore" },
    );
    const res = runHub(["doctor", "--merged"]);
    // still fails due to existing issues, but merged section should be present
    expect(res.stdout).toContain("already merged into default");
    expect(res.stdout).toContain("same-as-main");
  });

  test("doctor reports prunable worktree", () => {
    // Create a fresh hub for this test so other issues don't clutter assertions.
    const parent2 = fs.mkdtempSync(path.join(os.tmpdir(), "gwoc-prune-"));
    const hub2 = path.join(parent2, "p");
    const run2 = (args: string[], cwd = hub2) =>
      spawnSync("bun", [gwoc, ...args], { cwd, encoding: "utf8", env: { ...process.env, GWOC_GIT_DIR: "" } });
    expect(run2(["init", "p"], parent2).status).toBe(0);
    expect(run2(["new", "gone"]).status).toBe(0);
    // Delete the worktree directory directly — git still has admin metadata pointing at it.
    fs.rmSync(path.join(hub2, "gone"), { recursive: true, force: true });

    const res = run2(["doctor"]);
    const stdout = (res.stdout || "").toString();
    expect(res.status).not.toBe(0);
    expect(stdout).toContain("Prunable worktree");
    expect(stdout).toContain("gone");
    fs.rmSync(parent2, { recursive: true, force: true });
  });

  test("doctor reports missing primary worktree", () => {
    const parent3 = fs.mkdtempSync(path.join(os.tmpdir(), "gwoc-missp-"));
    const hub3 = path.join(parent3, "p");
    const run3 = (args: string[], cwd = hub3) =>
      spawnSync("bun", [gwoc, ...args], { cwd, encoding: "utf8", env: { ...process.env, GWOC_GIT_DIR: "" } });
    expect(run3(["init", "p"], parent3).status).toBe(0);
    // Nuke the primary worktree directory directly. The bare repo still has gwoc.primary config.
    fs.rmSync(path.join(hub3, "main"), { recursive: true, force: true });

    const res = run3(["doctor"]);
    const stdout = (res.stdout || "").toString();
    expect(res.status).not.toBe(0);
    expect(stdout).toContain("Missing primary worktree");
    fs.rmSync(parent3, { recursive: true, force: true });
  });

  test("doctor passes cleanly on a healthy hub", () => {
    const parent4 = fs.mkdtempSync(path.join(os.tmpdir(), "gwoc-healthy-"));
    const hub4 = path.join(parent4, "p");
    const run4 = (args: string[], cwd = hub4) =>
      spawnSync("bun", [gwoc, ...args], { cwd, encoding: "utf8", env: { ...process.env, GWOC_GIT_DIR: "" } });
    expect(run4(["init", "p"], parent4).status).toBe(0);
    expect(run4(["new", "ok"]).status).toBe(0);
    const res = run4(["doctor"]);
    const stdout = (res.stdout || "").toString();
    expect(res.status).toBe(0);
    expect(stdout).toContain("All checks passed");
    fs.rmSync(parent4, { recursive: true, force: true });
  });
});

describe("completion", () => {
  let hub: string;

  function runHub(args: string[], cwd?: string) {
    const res = spawnSync("bun", [gwoc, ...args], {
      cwd: cwd ?? hub,
      encoding: "utf8",
      env: { ...process.env, GWOC_GIT_DIR: "" },
    });
    return {
      stdout: (res.stdout || "").trim(),
      stderr: (res.stderr || "").trim(),
      status: res.status ?? 1,
    };
  }

  let parent: string;

  beforeAll(() => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), "gwoc-completion-"));
    hub = path.join(parent, "proj");
    expect(runHub(["init", "proj"], parent).status).toBe(0);
    expect(runHub(["new", "feat-a"]).status).toBe(0);
    expect(runHub(["new", "feat-b"]).status).toBe(0);
  });

  afterAll(() => {
    fs.rmSync(parent, { recursive: true, force: true });
  });

  test("completion bash emits installable script", () => {
    const res = runHub(["completion", "bash"]);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("_gwoc_complete");
    expect(res.stdout).toContain("complete -F _gwoc_complete gwoc");
  });

  test("completion zsh emits compdef script", () => {
    const res = runHub(["completion", "zsh"]);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("compdef _gwoc gwoc");
  });

  test("completion fish emits complete command", () => {
    const res = runHub(["completion", "fish"]);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("complete -c gwoc");
  });

  test("completion with unknown shell exits non-zero", () => {
    const res = runHub(["completion", "tcsh"]);
    expect(res.status).not.toBe(0);
  });

  test("__complete cword=1 filters subcommands by prefix", () => {
    const res = runHub(["__complete", "1", "gwoc", "ne"]);
    expect(res.status).toBe(0);
    const lines = res.stdout.split(/\n/).filter(Boolean);
    expect(lines).toContain("new");
    expect(lines).not.toContain("rm");
  });

  test("__complete cword=2 for rm returns slugs", () => {
    const res = runHub(["__complete", "2", "gwoc", "rm", ""]);
    expect(res.status).toBe(0);
    const lines = res.stdout.split(/\n/).filter(Boolean);
    expect(lines).toContain("feat-a");
    expect(lines).toContain("feat-b");
    expect(lines).toContain("main");
  });

  test("__complete cword=2 for rm with prefix filters slugs", () => {
    const res = runHub(["__complete", "2", "gwoc", "rm", "fe"]);
    expect(res.status).toBe(0);
    const lines = res.stdout.split(/\n/).filter(Boolean);
    expect(lines).toContain("feat-a");
    expect(lines).toContain("feat-b");
    expect(lines).not.toContain("main");
  });

  test("__complete cword=2 for init returns no candidates", () => {
    const res = runHub(["__complete", "2", "gwoc", "init", ""]);
    expect(res.status).toBe(0);
    expect(res.stdout).toBe("");
  });

  test("__complete cword=2 for completion returns shell names", () => {
    const res = runHub(["__complete", "2", "gwoc", "completion", ""]);
    expect(res.status).toBe(0);
    const lines = res.stdout.split(/\n/).filter(Boolean);
    expect(lines).toEqual(expect.arrayContaining(["bash", "zsh", "fish"]));
  });

  test("__complete outside a hub exits 0 with no output", () => {
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), "gwoc-nohub-"));
    const res = runHub(["__complete", "2", "gwoc", "rm", "fe"], outsideDir);
    expect(res.status).toBe(0);
    expect(res.stdout).toBe("");
    expect(res.stderr).toBe("");
    fs.rmSync(outsideDir, { recursive: true, force: true });
  });
});

describe("doctor --fix", () => {
  // The interactive fix prompts rely on @inquirer/prompts, which requires
  // a real TTY to consume input. spawnSync with piped stdin can't simulate
  // that reliably, so we only test the non-prompting paths here. The
  // interactive fix flow is verified manually.

  test("--fix flag is accepted and recognized", () => {
    const res = spawnSync("bun", [gwoc, "doctor", "--help"], {
      encoding: "utf8",
      env: { ...process.env, GWOC_GIT_DIR: "" },
    });
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("--fix");
  });

  test("--fix on a clean hub exits 0 without prompting", () => {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), "gwoc-docfix-clean-"));
    const hub = path.join(parent, "p");
    const run6 = (args: string[], cwd = hub) =>
      spawnSync("bun", [gwoc, ...args], {
        cwd,
        encoding: "utf8",
        env: { ...process.env, GWOC_GIT_DIR: "" },
        timeout: 3000,
      });
    expect(run6(["init", "p"], parent).status).toBe(0);

    // No prunable / no orphans / no mismatches → runFixMode returns early.
    // If it were to prompt, spawnSync would hang and the 3s timeout would
    // produce a non-zero status, which we'd catch.
    const res = run6(["doctor", "--fix"]);
    expect(res.status).toBe(0);

    fs.rmSync(parent, { recursive: true, force: true });
  });
});

describe("sync", () => {
  let hub: string;
  let sourceBare: string;
  let sourceWork: string;

  function runHub(args: string[], cwd?: string) {
    const res = spawnSync("bun", [gwoc, ...args], {
      cwd: cwd ?? hub,
      encoding: "utf8",
      env: { ...process.env, GWOC_GIT_DIR: "" },
    });
    return {
      stdout: (res.stdout || "").trim(),
      stderr: (res.stderr || "").trim(),
      status: res.status ?? 1,
    };
  }

  function commitIn(wt: string, file: string, body: string, msg: string) {
    fs.writeFileSync(path.join(wt, file), body);
    spawnSync("git", ["-C", wt, "add", file], { stdio: "ignore" });
    spawnSync(
      "git",
      ["-C", wt, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-m", msg],
      { stdio: "ignore" },
    );
  }

  beforeAll(() => {
    // local "origin" bare, local work copy to push through
    sourceWork = fs.mkdtempSync(path.join(os.tmpdir(), "gwoc-sync-origin-"));
    const bareParent = fs.mkdtempSync(path.join(os.tmpdir(), "gwoc-sync-bare-"));
    sourceBare = path.join(bareParent, "origin.git");

    spawnSync("git", ["init", "-b", "main", sourceWork], { stdio: "ignore" });
    commitIn(sourceWork, "README.md", "v1\n", "init");
    spawnSync("git", ["clone", "--bare", sourceWork, sourceBare], { stdio: "ignore" });

    const parent = fs.mkdtempSync(path.join(os.tmpdir(), "gwoc-sync-hub-"));
    hub = path.join(parent, "proj");
    expect(runHub(["clone", sourceBare, "proj"], parent).status).toBe(0);
  });

  afterAll(() => {
    fs.rmSync(path.dirname(hub), { recursive: true, force: true });
    fs.rmSync(sourceWork, { recursive: true, force: true });
    fs.rmSync(path.dirname(sourceBare), { recursive: true, force: true });
  });

  test("sync fast-forwards primary when origin has new commits", () => {
    // advance origin
    commitIn(sourceWork, "README.md", "v2\n", "v2");
    spawnSync("git", ["-C", sourceWork, "push", sourceBare, "main"], { stdio: "ignore" });

    const res = runHub(["sync"]);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("main: fast-forwarded");
    expect(fs.readFileSync(path.join(hub, "main", "README.md"), "utf8")).toBe("v2\n");
  });

  test("sync rebases feature worktree onto new default", () => {
    expect(runHub(["new", "feat-x"]).status).toBe(0);
    commitIn(path.join(hub, "feat-x"), "feat.txt", "feat body\n", "add feat");

    // advance origin
    commitIn(sourceWork, "README.md", "v3\n", "v3");
    spawnSync("git", ["-C", sourceWork, "push", sourceBare, "main"], { stdio: "ignore" });

    const res = runHub(["sync"]);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("feat-x");

    // feat-x should now contain both v3 (from rebase) and its own feat.txt
    expect(fs.readFileSync(path.join(hub, "feat-x", "README.md"), "utf8")).toBe("v3\n");
    expect(fs.existsSync(path.join(hub, "feat-x", "feat.txt"))).toBe(true);
  });

  test("sync skips dirty worktree", () => {
    expect(runHub(["new", "dirty-wt"]).status).toBe(0);
    fs.writeFileSync(path.join(hub, "dirty-wt", "scratch.txt"), "x\n");

    const res = runHub(["sync"]);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("dirty-wt: skipped (dirty)");
  });

  test("sync skips detached HEAD worktree", () => {
    expect(runHub(["new", "det-wt"]).status).toBe(0);
    spawnSync("git", ["-C", path.join(hub, "det-wt"), "checkout", "--detach"], { stdio: "ignore" });

    const res = runHub(["sync"]);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("det-wt: skipped (detached HEAD)");
  });

  test("sync --no-fetch skips the fetch step", () => {
    const res = runHub(["sync", "--no-fetch"]);
    expect(res.status).toBe(0);
    expect(res.stdout).not.toContain("Fetching");
  });

  test("sync idempotent second run reports up to date for primary", () => {
    const first = runHub(["sync"]);
    expect(first.status).toBe(0);
    const second = runHub(["sync"]);
    expect(second.status).toBe(0);
    expect(second.stdout).toContain("main: up to date");
  });

  test("sync auto-aborts on conflict and continues with other worktrees", () => {
    // Make a conflict: worktree edits README.md; origin also edits README.md
    // with different content. Rebase will conflict.
    expect(runHub(["new", "feat-conflict"]).status).toBe(0);
    commitIn(path.join(hub, "feat-conflict"), "README.md", "local edit\n", "feat edit");

    // Also create a worktree with a non-conflicting change so we can verify
    // sync kept going.
    expect(runHub(["new", "feat-safe"]).status).toBe(0);
    commitIn(path.join(hub, "feat-safe"), "safe.txt", "safe\n", "add safe");

    // Advance origin with a conflicting change.
    commitIn(sourceWork, "README.md", "upstream edit\n", "upstream edit");
    spawnSync("git", ["-C", sourceWork, "push", sourceBare, "main"], { stdio: "ignore" });

    const res = runHub(["sync"]);
    expect(res.status).toBe(0); // default auto-abort does not fail the whole sync
    expect(res.stdout).toContain("feat-conflict: skipped (rebase would conflict");
    expect(res.stdout).toContain("Conflicts (1)");

    // The conflicted worktree must NOT be mid-rebase.
    const gitDirRes = spawnSync("git", ["-C", path.join(hub, "feat-conflict"), "rev-parse", "--git-dir"], {
      encoding: "utf8",
    });
    const gitDir = path.resolve(path.join(hub, "feat-conflict"), (gitDirRes.stdout || "").trim());
    expect(fs.existsSync(path.join(gitDir, "rebase-merge"))).toBe(false);
    expect(fs.existsSync(path.join(gitDir, "rebase-apply"))).toBe(false);

    // The non-conflicting worktree must have been rebased.
    expect(res.stdout).toContain("feat-safe: rebased onto");
  });

  test("sync --stop-on-conflict leaves rebase in progress and exits non-zero", () => {
    // Independent scenario — fresh hub so ordering of other tests doesn't
    // matter. The prior test already exercised the auto-abort default; here
    // we just need ONE conflicting worktree to confirm the opt-in behavior.
    const parent2 = fs.mkdtempSync(path.join(os.tmpdir(), "gwoc-stopconflict-"));
    const hub2 = path.join(parent2, "proj");
    const srcWork = fs.mkdtempSync(path.join(os.tmpdir(), "gwoc-stopconflict-src-"));
    const bareParent = fs.mkdtempSync(path.join(os.tmpdir(), "gwoc-stopconflict-bare-"));
    const srcBare = path.join(bareParent, "origin.git");

    spawnSync("git", ["init", "-b", "main", srcWork], { stdio: "ignore" });
    commitIn(srcWork, "README.md", "v1\n", "init");
    spawnSync("git", ["clone", "--bare", srcWork, srcBare], { stdio: "ignore" });

    const run2 = (args: string[], cwd = hub2) =>
      spawnSync("bun", [gwoc, ...args], {
        cwd,
        encoding: "utf8",
        env: { ...process.env, GWOC_GIT_DIR: "" },
      });

    expect(run2(["clone", srcBare, "proj"], parent2).status).toBe(0);
    expect(run2(["new", "feat-stop"]).status).toBe(0);
    commitIn(path.join(hub2, "feat-stop"), "README.md", "local\n", "local edit");

    // Advance origin with a conflicting change.
    commitIn(srcWork, "README.md", "upstream\n", "upstream edit");
    spawnSync("git", ["-C", srcWork, "push", srcBare, "main"], { stdio: "ignore" });

    const res = run2(["sync", "--stop-on-conflict"]);
    expect(res.status).not.toBe(0);
    expect((res.stdout || "").toString()).toMatch(/rebase conflict/);

    // Verify the conflicting worktree IS mid-rebase (opt-in: user resolves).
    const gitDirRes = spawnSync(
      "git",
      ["-C", path.join(hub2, "feat-stop"), "rev-parse", "--git-dir"],
      { encoding: "utf8" },
    );
    const gitDir = path.resolve(path.join(hub2, "feat-stop"), (gitDirRes.stdout || "").trim());
    const inProgress =
      fs.existsSync(path.join(gitDir, "rebase-merge")) ||
      fs.existsSync(path.join(gitDir, "rebase-apply"));
    expect(inProgress).toBe(true);

    fs.rmSync(parent2, { recursive: true, force: true });
    fs.rmSync(srcWork, { recursive: true, force: true });
    fs.rmSync(bareParent, { recursive: true, force: true });
  });
});

describe("checkout", () => {
  let hub: string;
  let sourceBare: string;
  let sourceWork: string;

  function runHub(args: string[], cwd?: string) {
    const res = spawnSync("bun", [gwoc, ...args], {
      cwd: cwd ?? hub,
      encoding: "utf8",
      env: { ...process.env, GWOC_GIT_DIR: "" },
    });
    return {
      stdout: (res.stdout || "").trim(),
      stderr: (res.stderr || "").trim(),
      status: res.status ?? 1,
    };
  }

  function commitIn(wt: string, file: string, body: string, msg: string) {
    fs.writeFileSync(path.join(wt, file), body);
    spawnSync("git", ["-C", wt, "add", file], { stdio: "ignore" });
    spawnSync(
      "git",
      ["-C", wt, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-m", msg],
      { stdio: "ignore" },
    );
  }

  beforeAll(() => {
    sourceWork = fs.mkdtempSync(path.join(os.tmpdir(), "gwoc-co-origin-"));
    const bareParent = fs.mkdtempSync(path.join(os.tmpdir(), "gwoc-co-bare-"));
    sourceBare = path.join(bareParent, "origin.git");

    spawnSync("git", ["init", "-b", "main", sourceWork], { stdio: "ignore" });
    commitIn(sourceWork, "README.md", "v1\n", "init");

    // Push a feature branch with a slash in the name.
    spawnSync(
      "git",
      ["-C", sourceWork, "checkout", "-b", "user/pr-42"],
      { stdio: "ignore" },
    );
    commitIn(sourceWork, "FEATURE.md", "feature\n", "feat");
    spawnSync("git", ["-C", sourceWork, "checkout", "main"], { stdio: "ignore" });
    spawnSync("git", ["clone", "--bare", sourceWork, sourceBare], { stdio: "ignore" });

    const parent = fs.mkdtempSync(path.join(os.tmpdir(), "gwoc-co-hub-"));
    hub = path.join(parent, "proj");
    expect(runHub(["clone", sourceBare, "proj"], parent).status).toBe(0);
  });

  afterAll(() => {
    fs.rmSync(path.dirname(hub), { recursive: true, force: true });
    fs.rmSync(sourceWork, { recursive: true, force: true });
    fs.rmSync(path.dirname(sourceBare), { recursive: true, force: true });
  });

  test("checkout a remote branch with slash creates nested worktree tracking origin", () => {
    const res = runHub(["checkout", "user/pr-42"]);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("Worktree:");
    expect(res.stdout).toContain("Branch: user/pr-42");

    const wtPath = path.join(hub, "user", "pr-42");
    expect(fs.existsSync(wtPath)).toBe(true);
    expect(fs.existsSync(path.join(wtPath, "FEATURE.md"))).toBe(true);

    // Verify upstream wiring by reading the config keys directly. `gwoc clone`
    // sets the standard refspec and fetches, so upstream is set via
    // `--set-upstream-to origin/<branch>`, which writes exactly these keys.
    const bare = path.join(hub, "proj.git");
    const remoteCfg = spawnSync(
      "git",
      ["--git-dir", bare, "config", "branch.user/pr-42.remote"],
      { encoding: "utf8" },
    );
    expect((remoteCfg.stdout || "").trim()).toBe("origin");
    const mergeCfg = spawnSync(
      "git",
      ["--git-dir", bare, "config", "branch.user/pr-42.merge"],
      { encoding: "utf8" },
    );
    expect((mergeCfg.stdout || "").trim()).toBe("refs/heads/user/pr-42");

    // doctor should not complain about the nested slug now that the check
    // compares branch to the relative slug.
    const doc = runHub(["doctor"]);
    expect(doc.status).toBe(0);
    expect(doc.stdout).toContain("All checks passed");
  });

  test("checkout fails when the worktree path is already taken", () => {
    const res = runHub(["checkout", "user/pr-42"]);
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain("already exists");
  });

  test("checkout fails when branch is not found locally or remotely", () => {
    const res = runHub(["checkout", "does-not-exist"]);
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain("not found");
  });

  test("checkout reuses an existing local branch (no remote needed)", () => {
    // Create a purely local branch in the bare repo, no upstream.
    const bare = path.join(hub, "proj.git");
    spawnSync(
      "git",
      ["--git-dir", bare, "branch", "local-only", "main"],
      { stdio: "ignore" },
    );
    const res = runHub(["checkout", "local-only", "--no-fetch"]);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("Branch: local-only");
    expect(fs.existsSync(path.join(hub, "local-only"))).toBe(true);
  });

  test("checkout fails when the branch is already checked out elsewhere", () => {
    const res = runHub(["checkout", "local-only", "--no-fetch"]);
    expect(res.status).not.toBe(0);
    // Either path-exists or already-checked-out — both are acceptable failure modes.
    expect((res.stderr + res.stdout).toLowerCase()).toMatch(/already/);
  });
});

describe("running from inside the hub", () => {
  let parent: string;
  let hub: string;

  function runIn(cwd: string, args: string[]) {
    const res = spawnSync("bun", [gwoc, ...args], {
      cwd,
      encoding: "utf8",
      env: { ...process.env, GWOC_GIT_DIR: "" },
    });
    return {
      stdout: (res.stdout || "").trim(),
      stderr: (res.stderr || "").trim(),
      status: res.status ?? 1,
    };
  }

  beforeAll(() => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), "gwoc-inwt-"));
    hub = path.join(parent, "proj");
    expect(runIn(parent, ["init", "proj"]).status).toBe(0);
    expect(runIn(hub, ["new", "feat-a"]).status).toBe(0);
  });

  afterAll(() => {
    fs.rmSync(parent, { recursive: true, force: true });
  });

  test("list works from inside a worktree", () => {
    const res = runIn(path.join(hub, "feat-a"), ["list"]);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("feat-a");
    expect(res.stdout).toContain("main");
  });

  test("status works from a nested subdirectory of a worktree", () => {
    const deep = path.join(hub, "feat-a", "deep", "dir");
    fs.mkdirSync(deep, { recursive: true });
    const res = runIn(deep, ["status", "feat-a"]);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("Branch:       feat-a");
  });

  test("root resolves the hub root from inside a worktree", () => {
    const res = runIn(path.join(hub, "feat-a"), ["root"]);
    expect(res.status).toBe(0);
    expect(fs.realpathSync(res.stdout)).toBe(fs.realpathSync(hub));
  });

  test("new from inside a worktree creates a sibling at the hub root", () => {
    const res = runIn(path.join(hub, "feat-a"), ["new", "feat-b"]);
    expect(res.status).toBe(0);
    expect(fs.existsSync(path.join(hub, "feat-b"))).toBe(true);
  });

  test("works from a non-worktree hub subdirectory via ancestor walk", () => {
    const sub = path.join(hub, ".gwoc", "hooks");
    fs.mkdirSync(sub, { recursive: true });
    const res = runIn(sub, ["list"]);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("feat-a");
  });

  test("still errors inside a plain git repo that is not a hub", () => {
    const plain = path.join(parent, "plain-repo");
    spawnSync("git", ["init", "-q", plain], { stdio: "ignore" });
    const res = runIn(plain, ["list"]);
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain("not part of a gwoc hub");
  });

  test("rm refuses to remove the worktree containing the cwd", () => {
    const res = runIn(path.join(hub, "feat-b"), ["rm", "feat-b"]);
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain("Refusing to remove");
    expect(fs.existsSync(path.join(hub, "feat-b"))).toBe(true);
  });

  test("rename refuses on the cwd worktree", () => {
    const res = runIn(path.join(hub, "feat-a"), ["rename", "feat-a", "feat-z"]);
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain("Refusing to rename");
    expect(fs.existsSync(path.join(hub, "feat-a"))).toBe(true);
  });

  test("rm of another worktree still works from inside a worktree", () => {
    const res = runIn(path.join(hub, "feat-a"), ["rm", "feat-b", "--prune"]);
    expect(res.status).toBe(0);
    expect(fs.existsSync(path.join(hub, "feat-b"))).toBe(false);
  });

  test("slug completion works from inside a worktree", () => {
    const res = runIn(path.join(hub, "feat-a"), ["__complete", "2", "gwoc", "rm", ""]);
    expect(res.status).toBe(0);
    const lines = res.stdout.split(/\n/).filter(Boolean);
    expect(lines).toContain("feat-a");
    expect(lines).toContain("main");
  });
});

describe("slug separator", () => {
  let parent: string;
  let hub: string;

  function runIn(cwd: string, args: string[], extraEnv: Record<string, string> = {}) {
    const res = spawnSync("bun", [gwoc, ...args], {
      cwd,
      encoding: "utf8",
      env: { ...process.env, GWOC_GIT_DIR: "", ...extraEnv },
    });
    return {
      stdout: (res.stdout || "").trim(),
      stderr: (res.stderr || "").trim(),
      status: res.status ?? 1,
    };
  }

  beforeAll(() => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), "gwoc-slugsep-"));
    hub = path.join(parent, "proj");
    expect(runIn(parent, ["init", "proj", "--slug-separator", "_"]).status).toBe(0);
  });

  afterAll(() => {
    fs.rmSync(parent, { recursive: true, force: true });
  });

  test("new with a slashed name flattens the directory, keeps the branch slashed", () => {
    const res = runIn(hub, ["new", "feature/ticket-1"]);
    expect(res.status).toBe(0);
    expect(fs.existsSync(path.join(hub, "feature_ticket-1"))).toBe(true);
    expect(fs.existsSync(path.join(hub, "feature"))).toBe(false);
    const head = spawnSync("git", ["-C", path.join(hub, "feature_ticket-1"), "rev-parse", "--abbrev-ref", "HEAD"], { encoding: "utf8" });
    expect((head.stdout || "").trim()).toBe("feature/ticket-1");
  });

  test("doctor sees no slug/branch mismatch for flattened worktrees", () => {
    const res = runIn(hub, ["doctor"]);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("All checks passed");
  });

  test("status resolves by branch name and by directory name", () => {
    const byBranch = runIn(hub, ["status", "feature/ticket-1"]);
    expect(byBranch.status).toBe(0);
    expect(byBranch.stdout).toContain("Branch:       feature/ticket-1");
    const byDir = runIn(hub, ["status", "feature_ticket-1"]);
    expect(byDir.status).toBe(0);
    expect(byDir.stdout).toContain("Branch:       feature/ticket-1");
  });

  test("path prints the flattened location for a branch name", () => {
    const res = runIn(hub, ["path", "feature/ticket-1"]);
    expect(res.status).toBe(0);
    expect(res.stdout).toBe(path.join(hub, "feature_ticket-1"));
  });

  test("checkout of a slashed local branch lands in a flat directory", () => {
    spawnSync("git", ["--git-dir", path.join(hub, "proj.git"), "branch", "feature/co-test", "main"], { stdio: "ignore" });
    const res = runIn(hub, ["checkout", "feature/co-test", "--no-fetch"]);
    expect(res.status).toBe(0);
    expect(fs.existsSync(path.join(hub, "feature_co-test"))).toBe(true);
  });

  test("completion emits full flattened slugs", () => {
    const res = runIn(hub, ["__complete", "2", "gwoc", "rm", "feature"]);
    expect(res.status).toBe(0);
    const lines = res.stdout.split(/\n/).filter(Boolean);
    expect(lines).toContain("feature_ticket-1");
    expect(lines).toContain("feature_co-test");
  });

  test("rm --prune by branch name removes worktree and the slashed branch", () => {
    const res = runIn(hub, ["rm", "feature/co-test", "--prune"]);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("Deleted branch: feature/co-test");
    expect(fs.existsSync(path.join(hub, "feature_co-test"))).toBe(false);
    const branches = spawnSync("git", ["--git-dir", path.join(hub, "proj.git"), "branch"], { encoding: "utf8" });
    expect(branches.stdout).not.toContain("feature/co-test");
  });

  test("colliding flat names are refused", () => {
    expect(runIn(hub, ["new", "collide_x"]).status).toBe(0);
    const res = runIn(hub, ["new", "collide/x"]);
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain("already exists");
  });

  test("merge accepts the branch name for a flattened worktree", () => {
    expect(runIn(hub, ["new", "feature/merge-me"]).status).toBe(0);
    const wt = path.join(hub, "feature_merge-me");
    fs.writeFileSync(path.join(wt, "m.txt"), "m\n");
    spawnSync("git", ["-C", wt, "add", "m.txt"], { stdio: "ignore" });
    spawnSync("git", ["-C", wt, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-m", "m"], { stdio: "ignore" });
    const res = runIn(hub, ["merge", "feature/merge-me"]);
    expect(res.status).toBe(0);
    expect(fs.existsSync(path.join(hub, "main", "m.txt"))).toBe(true);
  });

  test("user-level git config applies without hub-level config", () => {
    const cfg = path.join(parent, "gitconfig-global");
    fs.writeFileSync(cfg, "[gwoc]\n\tslugSeparator = _\n[user]\n\tname = t\n\temail = t@t\n");
    const parent2 = path.join(parent, "userlevel");
    fs.mkdirSync(parent2);
    const env = { GIT_CONFIG_GLOBAL: cfg };
    expect(runIn(parent2, ["init", "p"], env).status).toBe(0);
    const hub2 = path.join(parent2, "p");
    expect(runIn(hub2, ["new", "user/level"], env).status).toBe(0);
    expect(fs.existsSync(path.join(hub2, "user_level"))).toBe(true);
  });

  test("hub-level config overrides user-level", () => {
    const cfg = path.join(parent, "gitconfig-global");
    const parent3 = path.join(parent, "override");
    fs.mkdirSync(parent3);
    const env = { GIT_CONFIG_GLOBAL: cfg };
    // `--slug-separator --` would read as the end-of-options marker; use = form.
    expect(runIn(parent3, ["init", "p", "--slug-separator=--"], env).status).toBe(0);
    const hub3 = path.join(parent3, "p");
    expect(runIn(hub3, ["new", "over/ride"], env).status).toBe(0);
    expect(fs.existsSync(path.join(hub3, "over--ride"))).toBe(true);
  });

  test("invalid separator (contains a slash) dies clearly", () => {
    const parent4 = path.join(parent, "invalid");
    fs.mkdirSync(parent4);
    expect(runIn(parent4, ["init", "p"]).status).toBe(0);
    const hub4 = path.join(parent4, "p");
    spawnSync("git", ["--git-dir", path.join(hub4, "p.git"), "config", "gwoc.slugSeparator", "a/b"], { stdio: "ignore" });
    const res = runIn(hub4, ["new", "x/y"]);
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain("Invalid gwoc.slugSeparator");
  });

  test("nested behavior is unchanged without a separator", () => {
    const parent5 = path.join(parent, "default");
    fs.mkdirSync(parent5);
    expect(runIn(parent5, ["init", "p"]).status).toBe(0);
    const hub5 = path.join(parent5, "p");
    expect(runIn(hub5, ["new", "user/nested"]).status).toBe(0);
    expect(fs.existsSync(path.join(hub5, "user", "nested"))).toBe(true);
  });
});

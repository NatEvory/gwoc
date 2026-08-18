import { describe, expect, test, mock, beforeEach, afterEach } from "bun:test";
import { parseVersionPart, versionGe, abspath, parseGitDirOverride } from "./git.ts";
import path from "node:path";

describe("parseVersionPart", () => {
  test("parses plain digits", () => {
    expect(parseVersionPart("42")).toBe(42);
  });

  test("parses leading digits before suffix", () => {
    expect(parseVersionPart("2rc1")).toBe(2);
  });

  test("returns 0 for empty string", () => {
    expect(parseVersionPart("")).toBe(0);
  });

  test("returns 0 when no leading digits", () => {
    expect(parseVersionPart("rc1")).toBe(0);
  });
});

describe("versionGe", () => {
  test("equal versions", () => {
    expect(versionGe("2.35.0", "2.35.0")).toBe(true);
  });

  test("greater major", () => {
    expect(versionGe("3.0.0", "2.35.0")).toBe(true);
  });

  test("lesser major", () => {
    expect(versionGe("1.99.0", "2.0.0")).toBe(false);
  });

  test("greater minor", () => {
    expect(versionGe("2.36.0", "2.35.0")).toBe(true);
  });

  test("lesser minor", () => {
    expect(versionGe("2.34.9", "2.35.0")).toBe(false);
  });

  test("greater patch", () => {
    expect(versionGe("2.35.1", "2.35.0")).toBe(true);
  });

  test("lesser patch", () => {
    expect(versionGe("2.35.0", "2.35.1")).toBe(false);
  });

  test("shorter version treated as zero-padded", () => {
    expect(versionGe("2.35", "2.35.0")).toBe(true);
    expect(versionGe("2.35.0", "2.35")).toBe(true);
  });

  test("handles pre-release suffixes in parts", () => {
    // "2.35.0rc1" → parts [2, 35, 0] — same as "2.35.0"
    expect(versionGe("2.35.0rc1", "2.35.0")).toBe(true);
  });
});

describe("abspath", () => {
  test("resolves relative path against cwd", () => {
    expect(abspath("foo/bar")).toBe(path.resolve("foo/bar"));
  });

  test("returns absolute path unchanged", () => {
    expect(abspath("/tmp/test")).toBe("/tmp/test");
  });
});

describe("parseGitDirOverride", () => {
  let origExit: typeof process.exit;
  let mockExit: ReturnType<typeof mock>;

  beforeEach(() => {
    origExit = process.exit;
    mockExit = mock(() => { throw new Error("exit"); });
    process.exit = mockExit as any;
  });

  afterEach(() => {
    process.exit = origExit;
  });

  test("parses --git-dir <value>", () => {
    process.exit = origExit;
    const rest = parseGitDirOverride(["--git-dir", "/some/path", "new", "slug"]);
    expect(rest).toEqual(["new", "slug"]);
  });

  test("parses --git-dir=<value>", () => {
    process.exit = origExit;
    const rest = parseGitDirOverride(["--git-dir=/some/path", "list"]);
    expect(rest).toEqual(["list"]);
  });

  test("returns args unchanged when no --git-dir", () => {
    process.exit = origExit;
    const args = ["new", "my-feature"];
    const rest = parseGitDirOverride(args);
    expect(rest).toEqual(["new", "my-feature"]);
  });

  test("dies on missing value", () => {
    expect(() => parseGitDirOverride(["--git-dir"])).toThrow();
  });

  test("dies when value looks like a flag", () => {
    expect(() => parseGitDirOverride(["--git-dir", "--other"])).toThrow();
  });
});

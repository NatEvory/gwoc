import { describe, expect, test, mock } from "bun:test";
import { die, normalizeSlug } from "./common.ts";

describe("die", () => {
  test("exits with default code 1", () => {
    const mockExit = mock(() => { throw new Error("exit"); });
    const origExit = process.exit;
    process.exit = mockExit as any;
    try {
      die("boom");
    } catch {
      // expected
    }
    expect(mockExit).toHaveBeenCalledWith(1);
    process.exit = origExit;
  });

  test("exits with custom code", () => {
    const mockExit = mock(() => { throw new Error("exit"); });
    const origExit = process.exit;
    process.exit = mockExit as any;
    try {
      die("boom", 2);
    } catch {
      // expected
    }
    expect(mockExit).toHaveBeenCalledWith(2);
    process.exit = origExit;
  });

  test("writes message to stderr with newline", () => {
    const written: string[] = [];
    const origWrite = process.stderr.write;
    const origExit = process.exit;
    process.stderr.write = ((msg: string) => { written.push(msg); return true; }) as any;
    process.exit = mock(() => { throw new Error("exit"); }) as any;
    try {
      die("no newline");
    } catch {
      // expected
    }
    expect(written).toEqual(["no newline\n"]);
    process.stderr.write = origWrite;
    process.exit = origExit;
  });

  test("does not double-append newline", () => {
    const written: string[] = [];
    const origWrite = process.stderr.write;
    const origExit = process.exit;
    process.stderr.write = ((msg: string) => { written.push(msg); return true; }) as any;
    process.exit = mock(() => { throw new Error("exit"); }) as any;
    try {
      die("has newline\n");
    } catch {
      // expected
    }
    expect(written).toEqual(["has newline\n"]);
    process.stderr.write = origWrite;
    process.exit = origExit;
  });
});

describe("normalizeSlug", () => {
  test("strips trailing slash", () => {
    expect(normalizeSlug("feature-a/")).toBe("feature-a");
  });

  test("strips multiple trailing slashes", () => {
    expect(normalizeSlug("feature-a///")).toBe("feature-a");
  });

  test("leaves clean slug unchanged", () => {
    expect(normalizeSlug("feature-a")).toBe("feature-a");
  });

  test("leaves empty string unchanged", () => {
    expect(normalizeSlug("")).toBe("");
  });
});

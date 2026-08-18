#!/usr/bin/env bun

import { die, requireCmd } from "./common.ts";
import { usage } from "./usage.ts";
import { runCommand } from "./wt/index.ts";
import pkg from "./package.json";

const VERSION = pkg.version;

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const cmd = argv[0];

  if (!cmd || cmd === "-h" || cmd === "--help" || cmd === "help") {
    usage();
    process.exit(0);
  }
  if (cmd === "-v" || cmd === "--version") {
    process.stdout.write(`gwoc ${VERSION}\n`);
    process.exit(0);
  }

  requireCmd("git");
  await runCommand(cmd, argv.slice(1));
}

main().catch((err) => {
  die(err instanceof Error ? err.message : String(err));
});

import { die } from "../common.ts";
import { parseGitDirOverride } from "../git.ts";
import { wtCheckout } from "./commands/checkout.ts";
import { wtClone } from "./commands/clone.ts";
import { wtComplete } from "./commands/complete.ts";
import { wtCompletion } from "./commands/completion.ts";
import { wtDefault, wtDir, wtPath, wtPrimary, wtRoot } from "./commands/info.ts";
import { wtDoctor } from "./commands/doctor.ts";
import { wtInit } from "./commands/init.ts";
import { wtFetch } from "./commands/fetch.ts";
import { wtList } from "./commands/list.ts";
import { wtMerge } from "./commands/merge.ts";
import { wtNew } from "./commands/new.ts";
import { wtPull } from "./commands/pull.ts";
import { wtPush } from "./commands/push.ts";
import { wtPrune } from "./commands/prune.ts";
import { wtRebase } from "./commands/rebase.ts";
import { wtManage } from "./commands/manage.ts";
import { wtSync } from "./commands/sync.ts";
import { wtRemove } from "./commands/rm.ts";
import { wtRename } from "./commands/rename.ts";
import { wtStatus } from "./commands/status.ts";

function hubCmd(args: string[]): string[] {
  if (args.includes("-h") || args.includes("--help")) {
    return args;
  }
  return parseGitDirOverride(args);
}

export function runCommand(cmd: string, rest: string[]): void | Promise<void> {
  switch (cmd) {
    case "init":
      wtInit(rest);
      return;
    case "clone":
      wtClone(rest);
      return;
    case "new":
      wtNew(hubCmd(rest));
      return;
    case "checkout":
    case "co":
      wtCheckout(hubCmd(rest));
      return;
    case "list":
    case "ls":
      wtList(hubCmd(rest));
      return;
    case "rm":
    case "remove":
      wtRemove(hubCmd(rest));
      return;
    case "rename":
    case "mv":
      wtRename(hubCmd(rest));
      return;
    case "status":
      wtStatus(hubCmd(rest));
      return;
    case "prune":
      wtPrune(hubCmd(rest));
      return;
    case "doctor":
    case "check":
      return wtDoctor(hubCmd(rest));
    case "root":
      wtRoot(hubCmd(rest));
      return;
    case "dir":
      wtDir(hubCmd(rest));
      return;
    case "primary":
      wtPrimary(hubCmd(rest));
      return;
    case "path":
      wtPath(hubCmd(rest));
      return;
    case "default":
      wtDefault(hubCmd(rest));
      return;
    case "merge":
      wtMerge(hubCmd(rest));
      return;
    case "fetch":
      wtFetch(hubCmd(rest));
      return;
    case "push":
      wtPush(hubCmd(rest));
      return;
    case "pull":
      wtPull(hubCmd(rest));
      return;
    case "rebase":
      wtRebase(hubCmd(rest));
      return;
    case "sync":
      wtSync(hubCmd(rest));
      return;
    case "manage":
    case "ui":
      return wtManage(hubCmd(rest));
    case "completion":
      wtCompletion(rest);
      return;
    case "__complete":
      // Hidden command for shell completion. Must not die outside a hub.
      wtComplete(rest);
      return;
    default:
      die(`Unknown command: ${cmd}`);
  }
}

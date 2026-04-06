import { handleAsk } from "../commands/ask.js";
import { handleClear } from "../commands/clear.js";
import { handleConfig } from "../commands/config.js";
import { handleDelete } from "../commands/delete.js";
import { handleInit } from "../commands/init.js";
import { handleRebuild } from "../commands/rebuild.js";
import { handleResume } from "../commands/resume.js";
import { handleRuns } from "../commands/runs.js";
import { handleStatus } from "../commands/status.js";
import { handleUpdate } from "../commands/update.js";
import { formatHelp } from "./help.js";

export async function executeCommand(command, args, context) {
  switch (command) {
    case "update":
      await handleUpdate(args, context);
      return;
    case "ask":
      await handleAsk(args, context);
      return;
    case "rebuild":
      await handleRebuild(args, context);
      return;
    case "init":
      await handleInit(args, context);
      return;
    case "resume":
      await handleResume(args, context);
      return;
    case "runs":
      await handleRuns(args, context);
      return;
    case "delete":
      await handleDelete(args, context);
      return;
    case "status":
      await handleStatus(args, context);
      return;
    case "config":
      await handleConfig(args, context);
      return;
    case "clear":
      await handleClear(args, context);
      return;
    default:
      throw new Error(`unknown command "${command}"\n\n${formatHelp()}`);
  }
}

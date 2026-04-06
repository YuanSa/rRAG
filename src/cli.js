import { handleAsk } from "./commands/ask.js";
import { handleClear } from "./commands/clear.js";
import { handleConfig } from "./commands/config.js";
import { handleDelete } from "./commands/delete.js";
import { handleInit } from "./commands/init.js";
import { handleRebuild } from "./commands/rebuild.js";
import { handleResume } from "./commands/resume.js";
import { handleRuns } from "./commands/runs.js";
import { handleStatus } from "./commands/status.js";
import { handleUpdate } from "./commands/update.js";
import { formatHelp } from "./lib/help.js";
import { createRepoContext } from "./lib/repo.js";

export async function runCli(argv, options = {}) {
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;
  const cwd = options.cwd ?? process.cwd();

  if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h") {
    stdout.write(formatHelp());
    return;
  }

  const [command, ...rest] = argv;
  const context = await createRepoContext({ cwd, stdout, stderr });

  switch (command) {
    case "update":
      await handleUpdate(rest, context);
      return;
    case "ask":
      await handleAsk(rest, context);
      return;
    case "rebuild":
      await handleRebuild(rest, context);
      return;
    case "init":
      await handleInit(rest, context);
      return;
    case "resume":
      await handleResume(rest, context);
      return;
    case "runs":
      await handleRuns(rest, context);
      return;
    case "delete":
      await handleDelete(rest, context);
      return;
    case "status":
      await handleStatus(rest, context);
      return;
    case "config":
      await handleConfig(rest, context);
      return;
    case "clear":
      await handleClear(rest, context);
      return;
    default:
      throw new Error(`unknown command "${command}"\n\n${formatHelp()}`);
  }
}

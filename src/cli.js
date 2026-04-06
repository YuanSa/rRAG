import { handleGui } from "./commands/gui.js";
import { executeCommand } from "./lib/command-executor.js";
import { formatHelp } from "./lib/help.js";
import { createRepoContext } from "./lib/repo.js";

export async function runCli(argv, options = {}) {
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;
  const stdin = options.stdin ?? process.stdin;
  const cwd = options.cwd ?? process.cwd();

  if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h") {
    stdout.write(formatHelp());
    return;
  }

  const [command, ...rest] = argv;
  const context = await createRepoContext({ cwd, stdout, stderr, stdin });

  switch (command) {
    case "gui":
      await handleGui(rest, context);
      return;
    default:
      await executeCommand(command, rest, context);
      return;
  }
}

import { mkdir, rm } from "node:fs/promises";
import path from "node:path";

export async function handleClear(args, context) {
  if (args.length > 0) {
    throw new Error("clear does not accept any arguments");
  }
  await rm(context.paths.staging, { recursive: true, force: true });
  await rm(context.paths.runs, { recursive: true, force: true });
  await rm(context.paths.archive, { recursive: true, force: true });

  await mkdir(context.paths.staging, { recursive: true });
  await mkdir(context.paths.runs, { recursive: true });
  await mkdir(context.paths.archive, { recursive: true });
  await mkdir(path.join(context.paths.archive, "staging"), { recursive: true });

  context.stdout.write("Cleared staging, runs, and archive data.\n");
  context.stdout.write(`Data root: ${context.paths.root}\n`);
}

import { listRuns } from "../lib/run-history.js";

export async function handleRuns(args, context) {
  const limitArg = args[0];
  const limit = limitArg ? Number(limitArg) : 10;
  const runs = await listRuns(context.paths.runs, {
    limit: Number.isFinite(limit) && limit > 0 ? limit : 10
  });

  context.stdout.write("# Runs\n\n");
  if (runs.length === 0) {
    context.stdout.write("No runs found.\n");
    return;
  }

  for (const run of runs) {
    context.stdout.write(`- ${run.runId}\n`);
    context.stdout.write(`  mode=${run.mode} state=${run.state} todo_items=${run.todoItems}`);
    if (run.plannerMode) {
      context.stdout.write(` planner=${run.plannerMode}`);
    }
    context.stdout.write(`\n`);
  }
}

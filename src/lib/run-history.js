import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

export async function listRuns(runsRoot, { limit = 20 } = {}) {
  const entries = await readdir(runsRoot, { withFileTypes: true });
  const directories = entries.filter(entry => entry.isDirectory()).map(entry => entry.name).sort().reverse();
  const selected = directories.slice(0, limit);
  const runs = [];

  for (const runId of selected) {
    const runPath = path.join(runsRoot, runId, "run.json");
    try {
      const raw = await readFile(runPath, "utf8");
      const run = JSON.parse(raw);
      runs.push({
        runId,
        mode: run.mode ?? "unknown",
        state: run.state?.status ?? inferStatus(run),
        createdAt: run.created_at ?? "",
        plannerMode: run.planner?.mode ?? "",
        todoItems: run.counts?.todo_items ?? 0
      });
    } catch {
      runs.push({
        runId,
        mode: "unknown",
        state: "unknown",
        createdAt: "",
        plannerMode: "",
        todoItems: 0
      });
    }
  }

  return runs;
}

function inferStatus(run) {
  if (run?.execution?.ok === true) {
    return "executed";
  }
  if (run?.execution?.ok === false) {
    return "failed";
  }
  if (Array.isArray(run?.plan) && run.plan.some(item => !item.done)) {
    return "planned";
  }
  return "unknown";
}

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
        selectorModes: collectSelectorModes(run),
        todoItems: run.counts?.todo_items ?? 0,
        question: run.question ?? "",
        resultCount: run.result_count ?? 0,
        visitedNodes: Array.isArray(run?.retrieval?.visited) ? run.retrieval.visited.length : 0,
        maxDepth: Array.isArray(run?.retrieval?.visited) ? Math.max(...run.retrieval.visited.map(node => node.depth ?? 0), 0) : 0
      });
    } catch {
      runs.push({
        runId,
        mode: "unknown",
        state: "unknown",
        createdAt: "",
        plannerMode: "",
        selectorModes: [],
        todoItems: 0,
        question: "",
        resultCount: 0,
        visitedNodes: 0,
        maxDepth: 0
      });
    }
  }

  return runs;
}

function collectSelectorModes(run) {
  const modes = new Set();
  if (Array.isArray(run?.retrieval?.visited)) {
    for (const node of run.retrieval.visited) {
      if (node.selectorMode) {
        modes.add(node.selectorMode);
      }
    }
  }
  return [...modes];
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

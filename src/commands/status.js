import { collectRepoStatus } from "../lib/status.js";

export async function handleStatus(_args, context) {
  const status = await collectRepoStatus(context.paths);

  context.stdout.write("# Status\n\n");
  context.stdout.write(`- active skills: ${status.skills}\n`);
  context.stdout.write(`- archived skills: ${status.archivedSkills}\n`);
  context.stdout.write(`- category paths: ${status.categories}\n`);
  context.stdout.write(`- active links: ${status.links}\n`);
  context.stdout.write(`- archived staging snapshots: ${status.archivedStaging}\n`);
  context.stdout.write(`- run directories: ${status.runs}\n`);
  context.stdout.write(`- run states: planned=${status.runStates.planned}, executing=${status.runStates.executing}, executed=${status.runStates.executed}, failed=${status.runStates.failed}, unknown=${status.runStates.unknown}\n`);
  context.stdout.write(`- planner modes: ${formatCounts(status.runModes.plannerModes)}\n`);
  context.stdout.write(`- selector modes: ${formatCounts(status.runModes.selectorModes)}\n`);
  context.stdout.write(`- ask stats: runs=${status.askStats.askRuns}, visited_nodes=${status.askStats.totalVisitedNodes}, max_depth=${status.askStats.maxDepthSeen}, total_results=${status.askStats.totalResults}\n`);
  context.stdout.write(`- llm enabled: ${context.config.llm_enabled ? "yes" : "no"}\n`);
  context.stdout.write(`- llm configured: ${context.llm.configured ? "yes" : "no"}\n`);
  context.stdout.write(`- llm model: ${context.config.llm_model}\n`);

  if (status.topCategories.length > 0) {
    context.stdout.write("- top categories:\n");
    for (const category of status.topCategories) {
      context.stdout.write(`  - ${category.name}: ${category.count}\n`);
    }
  }

  if (status.unlinkedSkills.length > 0) {
    context.stdout.write("- unlinked skills:\n");
    for (const skillId of status.unlinkedSkills) {
      context.stdout.write(`  - ${skillId}\n`);
    }
  }
}

function formatCounts(counts) {
  const entries = Object.entries(counts);
  if (entries.length === 0) {
    return "none";
  }
  return entries
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([key, value]) => `${key}=${value}`)
    .join(", ");
}

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
